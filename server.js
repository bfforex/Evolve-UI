// Evolve UI backend — memory, SearXNG search, and Ollama integration
import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8787;
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const CHAT_MODEL = process.env.CHAT_MODEL || 'llama3.2:3b';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const SEARXNG = (process.env.SEARXNG_URL || 'http://localhost:8080').replace(/\/+$/, '');

// Enable debug logging
const DEBUG = process.env.DEBUG === 'true';
function debugLog(...args) {
  if (DEBUG) console.log('[DEBUG]', ...args);
}

const dataDir = path.join(__dirname, 'data');
const sessionsDir = path.join(dataDir, 'sessions');
const memoryFile = path.join(dataDir, 'memory.json');
const uploadsDir = path.join(dataDir, 'uploads');

await fs.mkdir(sessionsDir, { recursive: true });
await fs.mkdir(uploadsDir, { recursive: true });
await ensureFile(memoryFile, { longTerm: [], nextId: 1 });

function nowISO() { return new Date().toISOString(); }
async function ensureFile(file, init) {
  try { await fs.access(file); } catch { await fs.writeFile(file, JSON.stringify(init, null, 2)); }
}
async function readJSON(file) { return JSON.parse(await fs.readFile(file, 'utf-8')); }
async function writeJSON(file, data) { await fs.writeFile(file, JSON.stringify(data, null, 2)); }

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.json', '.csv', '.md', '.js', '.py', '.html', '.css'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowedTypes.includes(ext));
  }
});

// ------- Enhanced Ollama helpers with error handling
async function ollamaChat({ model, messages, stream = false, timeout = 300000 }) {
  debugLog('Ollama chat request:', { model, messageCount: messages.length });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Ollama chat error ${res.status}: ${errorText}`);
    }
    
    return await res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Ollama request timeout');
    }
    throw error;
  }
}

async function ollamaGenerate({ model, prompt, stream = false, timeout = 300000 }) {
  debugLog('Ollama generate request:', { model, promptLength: prompt.length });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Ollama generate error ${res.status}: ${errorText}`);
    }
    
    return await res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Ollama request timeout');
    }
    throw error;
  }
}

async function ollamaEmbed(texts, timeout = 300000) {
  const inputs = Array.isArray(texts) ? texts : [texts];
  debugLog('Ollama embed request:', { inputCount: inputs.length });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(`${OLLAMA}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Ollama embed error ${res.status}: ${errorText}`);
    }
    
    const json = await res.json();
    const embs = json.embeddings || (json.embedding ? [json.embedding] : []);
    return embs;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Ollama embed request timeout');
    }
    throw error;
  }
}

function cosSim(a, b) {
  let dp = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dp += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dp / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

// ------- Memory store (unchanged)
async function loadSession(sessionId) {
  const file = path.join(sessionsDir, `${sessionId}.json`);
  await ensureFile(file, { created: nowISO(), messages: [] });
  return { file, data: await readJSON(file) };
}
async function saveSession(file, data) { await writeJSON(file, data); }

async function loadMemory() { return readJSON(memoryFile); }
async function saveMemory(mem) { return writeJSON(memoryFile, mem); }

async function retrieveLongTermMemory(query, k = 5, minSim = 0.25) {
  const mem = await loadMemory();
  if (!mem.longTerm.length) return [];
  const [qEmb] = await ollamaEmbed([query]);
  const scored = [];
  for (const item of mem.longTerm) {
    if (!item.embedding) continue;
    const sim = cosSim(qEmb, item.embedding);
    if (sim >= minSim) scored.push({ ...item, sim });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, k);
}

async function upsertLongTermMemory(items) {
  if (!items || !items.length) return [];
  const mem = await loadMemory();
  const existing = new Set(mem.longTerm.map(i => i.content.trim().toLowerCase()));
  const newOnes = items
    .map(i => ({ content: (i.content || '').trim(), tags: i.tags || [] }))
    .filter(i => i.content && !existing.has(i.content.toLowerCase()));
  if (!newOnes.length) return [];
  const embs = await ollamaEmbed(newOnes.map(i => i.content));
  newOnes.forEach((it, idx) => {
    mem.longTerm.push({
      id: mem.nextId++,
      content: it.content,
      tags: it.tags,
      addedAt: nowISO(),
      embedding: embs[idx]
    });
  });
  await saveMemory(mem);
  return newOnes;
}

async function extractMemoryFromTurn(model, messages) {
  const sys = `You extract durable user memory from chats.
Return a JSON array of short facts the assistant should remember long-term.
Only include preferences, identities, recurring goals, constraints, tools, or corrections.
Each item: {"content": "...", "tags": ["preference" | "identity" | "goal" | "constraint" | "tool" | "correction"]}.
If nothing, return [].`;
  const joined = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const out = await ollamaGenerate({ model, prompt: `${sys}\n\nCHAT:\n${joined}\n\nJSON:` });
  try {
    const text = out.response || '';
    const jsonStr = text.match(/\[[\s\S]*\]/)?.[0] || '[]';
    const arr = JSON.parse(jsonStr);
    return Array.isArray(arr) ? arr.filter(x => x && x.content) : [];
  } catch {
    return [];
  }
}

// ------- Enhanced SearXNG search with better error handling
async function webSearch(query, { count = 6, timeout = 100000 } = {}) {
  debugLog('Web search request:', { query, count });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    // Try multiple search engines/formats
    const searchUrls = [
      `${SEARXNG}/search?q=${encodeURIComponent(query)}&format=json&language=en&safesearch=1&categories=general`,
      `${SEARXNG}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,duckduckgo`,
      `${SEARXNG}/?q=${encodeURIComponent(query)}&format=json`,
    ];
    
    for (const url of searchUrls) {
      debugLog('Trying search URL:', url);
      
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; EvolveUI/1.0)',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        
        debugLog('Search response status:', res.status);
        
        if (!res.ok) {
          debugLog('Search failed:', res.status, res.statusText);
          continue; // Try next URL
        }
        
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          debugLog('Non-JSON response:', contentType);
          continue; // Try next URL
        }
        
        const json = await res.json();
        debugLog('Search results:', { 
          hasResults: !!json.results, 
          resultCount: json.results?.length || 0,
          suggestions: json.suggestions?.length || 0
        });
        
        const results = (json.results || [])
          .filter(r => r && r.url && r.url.startsWith('http'))
          .slice(0, count)
          .map(r => ({
            title: (r.title || r.url || '').trim(),
            url: r.url.trim(),
            snippet: (r.content || r.snippet || '').trim()
          }))
          .filter(r => r.title && r.url);
        
        clearTimeout(timeoutId);
        debugLog('Processed results:', results.length);
        
        if (results.length > 0) {
          return results;
        }
        
      } catch (urlError) {
        debugLog('URL failed:', url, urlError.message);
        continue; // Try next URL
      }
    }
    
    clearTimeout(timeoutId);
    debugLog('All search URLs failed');
    return [];
    
  } catch (error) {
    clearTimeout(timeoutId);
    debugLog('Search error:', error.message);
    
    if (error.name === 'AbortError') {
      throw new Error('Search request timeout');
    }
    
    return [];
  }
}

async function fetchAndClean(url, timeout = 80000) {
  debugLog('Fetching URL:', url);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(url, { 
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EvolveUI/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      debugLog('Fetch failed:', url, res.status);
      return '';
    }
    
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      debugLog('Non-HTML content:', url, contentType);
      return '';
    }
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, noscript, nav, footer, aside, .advertisement, .ads, .popup').remove();
    
    // Extract main content
    const mainContent = $('main, article, .content, .post, .entry').first();
    const textContent = mainContent.length > 0 ? mainContent.text() : $('body').text();
    
    const cleaned = textContent
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000); // Reduced from 20000 to prevent overwhelming context
    
    debugLog('Cleaned content length:', cleaned.length);
    return cleaned;
    
  } catch (error) {
    clearTimeout(timeoutId);
    debugLog('Fetch error:', url, error.message);
    return '';
  }
}

async function searchAndSummarize(model, query) {
  debugLog('Starting search and summarize for:', query);
  
  try {
    const results = await webSearch(query, { count: 4 });
    debugLog('Search results received:', results.length);
    
    if (!results.length) {
      return { 
        answer: `I couldn't find any search results for "${query}". This might be due to:\n- SearXNG server not responding\n- Network connectivity issues\n- Query blocked by search filters\n\nPlease check your SearXNG configuration at: ${SEARXNG}`, 
        sources: [] 
      };
    }
    
    // Fetch content from top results
    const fetchPromises = results.slice(0, 3).map(async (result, index) => {
      const content = await fetchAndClean(result.url);
      return { ...result, content, index: index + 1 };
    });
    
    const fetchedResults = await Promise.allSettled(fetchPromises);
    const validResults = fetchedResults
      .filter(p => p.status === 'fulfilled' && p.value.content.length > 100)
      .map(p => p.value);
    
    debugLog('Valid fetched results:', validResults.length);
    
    if (!validResults.length) {
      return {
        answer: `I found search results for "${query}" but couldn't access the content of the web pages. The search returned:\n\n` +
          results.slice(0, 3).map((r, i) => `[${i + 1}] **${r.title}**\n${r.url}\n${r.snippet || 'No snippet available'}`).join('\n\n') +
          '\n\nYou can visit these links directly for more information.',
        sources: results.slice(0, 3).map((r, i) => ({ idx: i + 1, title: r.title, url: r.url }))
      };
    }
    
    // Create context for AI
    const corpus = validResults
      .map(r => `[#${r.index}] ${r.title}\nURL: ${r.url}\n${r.content}`)
      .join('\n\n---\n\n');
    
    debugLog('Corpus length:', corpus.length);
    
    const prompt = `Using ONLY the sources provided below, answer the user's query in a comprehensive and well-structured way using Markdown formatting.

IMPORTANT INSTRUCTIONS:
- Base your answer ONLY on the provided sources
- Include relevant details and context from the sources
- Use proper Markdown formatting (headers, lists, emphasis)
- Cite sources using [#1], [#2], etc. throughout your answer
- Include a "Sources" section at the end with numbered references
- If the sources don't contain sufficient information, say so clearly

User Query: ${query}

Sources:
${corpus}

Answer:`;
    
    const gen = await ollamaGenerate({ model, prompt, timeout: 450000 });
    const answer = gen.response || 'No response generated';
    
    debugLog('Generated answer length:', answer.length);
    
    const sources = validResults.map(r => ({ 
      idx: r.index, 
      title: r.title, 
      url: r.url 
    }));
    
    return { answer, sources };
    
  } catch (error) {
    debugLog('Search and summarize error:', error.message);
    return {
      answer: `An error occurred while searching and processing results: ${error.message}\n\nPlease check:\n- SearXNG server status at: ${SEARXNG}\n- Network connectivity\n- Ollama model availability`,
      sources: []
    };
  }
}

async function shouldSearch(model, userMsg, memoryContext) {
  debugLog('Evaluating if search is needed for:', userMsg.substring(0, 100));
  
  const sys = `Analyze if this user message requires web search for current/factual information.

Return ONLY "yes" or "no".

Return "yes" if the query asks for:
- Current news, events, or recent developments
- Real-time data (weather, stock prices, schedules)
- Specific facts, statistics, or verification
- Product information, reviews, or comparisons
- Technical specifications or documentation
- Location-specific information

Return "no" for:
- General knowledge questions
- Programming help (unless asking for latest versions)
- Math calculations or logic problems
- Creative writing or brainstorming
- Personal advice or opinions
- Questions answerable with common knowledge`;

  try {
    const prompt = `${sys}\n\nUser Context/Memory:\n${memoryContext || '(none)'}\n\nUser Message:\n"${userMsg}"\n\nDecision:`;
    const out = await ollamaGenerate({ model, prompt, timeout: 300000 });
    const decision = /yes/i.test(out.response || '');
    debugLog('Search decision:', decision, 'for query:', userMsg.substring(0, 50));
    return decision;
  } catch (error) {
    debugLog('Search decision error:', error.message);
    return false; // Default to no search if decision fails
  }
}

// ------- API routes
app.get('/api/health', (_req, res) => {
  res.json({ 
    ok: true, 
    time: nowISO(),
    services: {
      ollama: OLLAMA,
      searxng: SEARXNG,
      debug: DEBUG
    }
  });
});

app.get('/api/models', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
    if (!r.ok) throw new Error(`Ollama not available: ${r.status}`);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/memory', async (_req, res) => {
  try {
    const memory = await loadMemory();
    res.json({
      ...memory,
      stats: {
        totalItems: memory.longTerm.length,
        lastUpdated: memory.longTerm.length > 0 ? memory.longTerm[memory.longTerm.length - 1].addedAt : null
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/memory/clear', async (_req, res) => {
  try {
    await writeJSON(memoryFile, { longTerm: [], nextId: 1 });
    res.json({ ok: true, clearedAt: nowISO() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const content = await fs.readFile(req.file.path, 'utf-8');
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(() => {});
    
    res.json({
      filename: req.file.originalname,
      size: req.file.size,
      content: content.slice(0, 50000), // Limit content size
      uploadedAt: nowISO()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Enhanced search test endpoint
app.get('/api/search/test', async (req, res) => {
  const query = req.query.q || 'test search';
  debugLog('Testing search with query:', query);
  
  try {
    const results = await webSearch(query);
    res.json({
      query,
      searxngUrl: SEARXNG,
      resultCount: results.length,
      results: results.slice(0, 3),
      timestamp: nowISO()
    });
  } catch (e) {
    res.status(500).json({ 
      error: e.message, 
      searxngUrl: SEARXNG,
      query 
    });
  }
});

app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();
  debugLog('Chat request started');
  
  try {
    const {
      sessionId,
      message,
      model = CHAT_MODEL,
      autoSearch = true,
      useMemory = true,
      fileContent = null
    } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message required' });
    }

    debugLog('Processing chat:', { sessionId, model, autoSearch, useMemory, hasFile: !!fileContent });

    const { file, data } = await loadSession(sessionId);
    const history = data.messages || [];

    // Prepare message with file content if provided
    let processedMessage = message;
    if (fileContent) {
      processedMessage = `File content:\n\`\`\`\n${fileContent}\n\`\`\`\n\nUser question: ${message}`;
    }

    // Memory retrieval
    let memoryContext = '';
    let retrieved = [];
    if (useMemory) {
      try {
        const memHits = await retrieveLongTermMemory(processedMessage);
        retrieved = memHits;
        if (memHits.length) {
          memoryContext = 'Long-term memory:\n' + memHits.map(m => `- ${m.content}`).join('\n');
          debugLog('Retrieved memory items:', memHits.length);
        }
      } catch (memError) {
        debugLog('Memory retrieval error:', memError.message);
      }
    }

    // System prompt
    const system = `You are Evolve, a precise and helpful AI assistant.
    
Key behaviors:
- Provide comprehensive, well-structured answers using Markdown
- Follow user preferences from memory if available
- When using web sources, cite them properly throughout your response
- Be accurate, helpful, and conversational
- For code, provide working examples with explanations`;

    const context = [
      { role: 'system', content: system },
      ...(memoryContext ? [{ role: 'system', content: memoryContext }] : []),
      ...history.slice(-12) // Reduced history to prevent context overflow
    ];

    // Search decision and execution
    let usedSearch = false;
    let finalAnswer = '';
    let sources = [];

    if (autoSearch && !fileContent && (await shouldSearch(model, processedMessage, memoryContext))) {
      debugLog('Performing web search');
      usedSearch = true;
      
      try {
        const searchResult = await searchAndSummarize(model, processedMessage);
        finalAnswer = searchResult.answer;
        sources = searchResult.sources;
        debugLog('Search completed, sources found:', sources.length);
      } catch (searchError) {
        debugLog('Search failed:', searchError.message);
        finalAnswer = `I attempted to search for current information but encountered an issue: ${searchError.message}\n\nLet me answer based on my knowledge instead:\n\n`;
        
        // Fallback to regular chat
        const resp = await ollamaChat({ model, messages: [...context, { role: 'user', content: processedMessage }] });
        finalAnswer += resp.message?.content || resp.response || '';
      }
    } else {
      debugLog('Using direct chat (no search needed)');
      const resp = await ollamaChat({ model, messages: [...context, { role: 'user', content: processedMessage }] });
      finalAnswer = resp.message?.content || resp.response || '';
    }

    // Save conversation turn
    const turn = [
      { role: 'user', content: message, time: nowISO() },
      { role: 'assistant', content: finalAnswer, time: nowISO(), usedSearch }
    ];
    data.messages = [...history, ...turn];
    await saveSession(file, data);

    // Extract and store memory
    let memoryAdded = [];
    if (useMemory && finalAnswer) {
      try {
        const extracted = await extractMemoryFromTurn(model, [...context, ...turn]);
        const upserted = await upsertLongTermMemory(extracted);
        memoryAdded = upserted.map(m => ({ content: m.content, tags: m.tags || [] }));
        debugLog('Memory items added:', memoryAdded.length);
      } catch (memError) {
        debugLog('Memory extraction error:', memError.message);
      }
    }

    const processingTime = Date.now() - startTime;
    debugLog('Chat request completed in', processingTime, 'ms');

    res.json({
      answer: finalAnswer,
      sources,
      usedSearch,
      memoryAdded,
      retrievedMemory: retrieved.map(m => ({ content: m.content })),
      engine: usedSearch ? 'SearXNG' : null,
      model,
      processingTime: processingTime,
      debug: DEBUG ? {
        contextLength: context.length,
        memoryItems: retrieved.length,
        searchPerformed: usedSearch,
        sourcesFound: sources.length
      } : undefined
    });

  } catch (e) {
    const processingTime = Date.now() - startTime;
    debugLog('Chat request error:', e.message, 'after', processingTime, 'ms');
    
    res.status(500).json({ 
      error: e.message,
      processingTime,
      debug: DEBUG ? { stack: e.stack } : undefined
    });
  }
});

// Enhanced static file serving
app.get('*', (req, res) => {
  // Serve index.html for all routes (SPA behavior)
  res.sendFile(path.join(__dirname, 'public','index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  debugLog('Express error:', error.message);
  res.status(500).json({ 
    error: 'Internal server error',
    message: DEBUG ? error.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Evolve UI running at http://localhost:${PORT}`);
  console.log(`Configuration:
- Ollama: ${OLLAMA}
- SearXNG: ${SEARXNG}  
- Chat Model: ${CHAT_MODEL}
- Embed Model: ${EMBED_MODEL}
- Debug: ${DEBUG}
- Data Directory: ${dataDir}`);
  
  if (DEBUG) {
    console.log('\n🔧 Debug mode enabled. Set DEBUG=false to disable verbose logging.\n');
  }
  
  console.log('\n🔍 Test your SearXNG connection at: http://localhost:' + PORT + '/api/search/test?q=hello\n');
});