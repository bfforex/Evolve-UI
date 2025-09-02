/**
 * Evolve-UI Server - Enhanced AI Chat Interface
 * 
 * Features:
 * - AI Thinking Engine with real-time visualization
 * - Smart Web Search with multi-query generation
 * - Enhanced RAG with vector similarity matching
 * - Persistent Memory System with automatic extraction
 * - Session Management with CRUD operations
 * - File Upload with multi-format support
 * - Real-time Streaming with Server-Sent Events
 * - Security with Helmet, CORS, and rate limiting
 * 
 * @version 2.2.0
 * @author bfforex
 */

// === ENHANCED SERVER.JS - FIXED VERSION ===

import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8787;
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const CHAT_MODEL = process.env.CHAT_MODEL || 'llama3.2:3b';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const SEARXNG = (process.env.SEARXNG_URL || 'http://172.26.48.172:8080').replace(/\/+$/, '');
const DEBUG = process.env.DEBUG === 'true';

/**
 * Debug logging function
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
  if (DEBUG) console.log('[DEBUG]', new Date().toISOString(), ...args);
}

// Data directories
const dataDir = path.join(__dirname, 'data');
const sessionsDir = path.join(dataDir, 'sessions');
const memoryFile = path.join(dataDir, 'memory.json');
const uploadsDir = path.join(dataDir, 'uploads');

await fs.mkdir(sessionsDir, { recursive: true });
await fs.mkdir(uploadsDir, { recursive: true });

/**
 * Ensure a file exists with initial data
 * @param {string} file - File path
 * @param {any} init - Initial data to write if file doesn't exist
 */
async function ensureFile(file, init) {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify(init, null, 2));
  }
}

await ensureFile(memoryFile, { longTerm: [], nextId: 1 });

/**
 * Get current timestamp in ISO format
 * @returns {string} ISO timestamp
 */
function nowISO() {
  return new Date().toISOString();
}

async function readJSON(file) {
  try {
    const content = await fs.readFile(file, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    debugLog('Failed to read JSON file:', file, error.message);
    throw error;
  }
}

async function writeJSON(file, data) {
  try {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
  } catch (error) {
    debugLog('Failed to write JSON file:', file, error.message);
    throw error;
  }
}

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        scriptSrc: [
          '\'self\'',
          '\'unsafe-inline\'',
          'https://cdnjs.cloudflare.com',
          'https://cdn.tailwindcss.com'
        ],
        styleSrc: [
          '\'self\'', 
          '\'unsafe-inline\'', 
          'https://cdnjs.cloudflare.com', 
          'https://fonts.googleapis.com'
        ],
        fontSrc: ['\'self\'', 'https://fonts.gstatic.com'],
        imgSrc: ['\'self\'', 'data:', 'https:'],
        connectSrc: ['\'self\'', 'ws:', 'wss:']
      }
    }
  })
);

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: 'Too many chat requests, please try again later.' }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many uploads, please try again later.' }
});

// Multer configuration
const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
  }
});

// Input validation
const validateChatInput = (req, res, next) => {
  const { sessionId, message, model } = req.body;

  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }

  if (!message || typeof message !== 'string' || message.length > 10000) {
    return res.status(400).json({ error: 'Invalid message length' });
  }

  if (model && typeof model !== 'string') {
    return res.status(400).json({ error: 'Invalid model parameter' });
  }

  req.body.message = message.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  next();
};

// Enhanced Ollama helpers
async function ollamaChat({ model, messages, stream = true, timeout = 300000 }) {
  debugLog('Ollama chat request:', model, 'messages:', messages.length);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Ollama error ${response.status}: ${errorText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

async function ollamaGenerate({ model, prompt, stream = false, timeout = 300000 }) {
  debugLog('Ollama generate request:', model);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Ollama error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

async function ollamaEmbed(texts, timeout = 300000) {
  const inputs = Array.isArray(texts) ? texts : [texts];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${OLLAMA}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Embedding error: ${response.status}`);
    }

    const result = await response.json();
    return result.embeddings || (result.embedding ? [result.embedding] : []);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Enhanced thinking and planning system
class AIThinkingEngine {
  constructor(model) {
    this.model = model;
  }

  async analyzeQuery(query, context = '') {
    const analysisPrompt = `<thinking>
Analyze this user query to determine:
1. What type of information is needed (factual, creative, analytical, etc.)
2. Whether current/real-time information is required
3. What search strategies would be most effective
4. How complex the response should be
5. What expertise domains are relevant

Query: "${query}"
Context: ${context}

Provide detailed analysis of the query requirements.
</thinking>

Based on the query analysis, I need to:`;

    try {
      const result = await ollamaGenerate({
        model: this.model,
        prompt: analysisPrompt,
        timeout: 60000
      });
      return this.parseThinkingResponse(result.response || '');
    } catch (error) {
      debugLog('Query analysis error:', error.message);
      return {
        thoughts: [{ content: `Failed to analyze query: ${error.message}`, type: 'error' }],
        analysis: { needsSearch: false, complexity: 'medium', domains: [] }
      };
    }
  }

  async planResponse(query, analysis, searchResults = [], memoryContext = '') {
    const planningPrompt = `<thinking>
Plan a comprehensive response strategy:

Query: "${query}"
Analysis: ${JSON.stringify(analysis)}
Available search results: ${searchResults.length} items
Memory context available: ${memoryContext ? 'Yes' : 'No'}

I need to:
1. Determine if current search results are sufficient
2. Plan additional searches if needed
3. Structure the response for maximum clarity and helpfulness
4. Identify any knowledge gaps that need addressing
5. Decide on the optimal response format

Planning the response structure and approach...
</thinking>

Response plan:`;

    try {
      const result = await ollamaGenerate({
        model: this.model,
        prompt: planningPrompt,
        timeout: 60000
      });
      return this.parseThinkingResponse(result.response || '');
    } catch (error) {
      debugLog('Response planning error:', error.message);
      return {
        thoughts: [{ content: `Failed to plan response: ${error.message}`, type: 'error' }],
        plan: { needsMoreSearch: false, searchQueries: [], responseStructure: 'standard' }
      };
    }
  }

  async evaluateResponse(query, response, sources = []) {
    const evaluationPrompt = `<thinking>
Evaluate this response for quality and completeness:

Original Query: "${query}"
Generated Response: "${response}"
Sources Used: ${sources.length}

Checking for:
1. Accuracy and factual correctness
2. Completeness relative to the query
3. Clarity and structure
4. Proper use of sources
5. Areas for improvement

Quality assessment and recommendations...
</thinking>

Response evaluation:`;

    try {
      const result = await ollamaGenerate({
        model: this.model,
        prompt: evaluationPrompt,
        timeout: 60000
      });
      return this.parseThinkingResponse(result.response || '');
    } catch (error) {
      debugLog('Response evaluation error:', error.message);
      return {
        thoughts: [{ content: `Failed to evaluate response: ${error.message}`, type: 'error' }],
        evaluation: { quality: 'unknown', needsImprovement: false, suggestions: [] }
      };
    }
  }

  parseThinkingResponse(content) {
    const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
    const thoughts = [];
    let match;

    while ((match = thinkingRegex.exec(content)) !== null) {
      const thoughtContent = match[1].trim();
      if (thoughtContent) {
        thoughts.push({
          content: thoughtContent,
          timestamp: nowISO(),
          type: 'analysis'
        });
      }
    }

    const response = content.replace(thinkingRegex, '').trim();
    return { thoughts, response };
  }

  async determineSearchNeed(query, context = '') {
    const searchKeywords = [
      'current', 'recent', 'latest', 'news', 'today', 'now', 'this year',
      'weather', 'price', 'stock', 'when did', 'what happened', 'status',
      'who is currently', 'what is the current', 'update on', '2024', '2025'
    ];

    // Quick keyword check
    if (searchKeywords.some(keyword => query.toLowerCase().includes(keyword))) {
      return { needsSearch: true, confidence: 0.8, reason: 'Contains time-sensitive keywords' };
    }

    // AI-based determination for complex cases
    const prompt = `<thinking>
Should I search the web for current information to answer: "${query}"?

Context: ${context}

Consider:
- Does this require current/recent information?
- Is this general knowledge I likely already know?
- Would web search significantly improve the answer quality?
- Are there specific facts, dates, or data points needed?

Analyzing the need for web search...
</thinking>

Search decision: `;

    try {
      const result = await ollamaGenerate({
        model: this.model,
        prompt,
        timeout: 30000
      });

      const thinking = this.parseThinkingResponse(result.response || '');
      const response = thinking.response.toLowerCase();
      
      const needsSearch = response.includes('yes') || response.includes('search') || 
                         response.includes('web') || response.includes('current');
      
      return {
        needsSearch,
        confidence: needsSearch ? 0.7 : 0.6,
        reason: thinking.response,
        thoughts: thinking.thoughts
      };
    } catch (error) {
      debugLog('Search decision error:', error.message);
      return { needsSearch: false, confidence: 0.5, reason: 'Analysis failed' };
    }
  }
}

// Enhanced web search with smart querying
class SmartWebSearch {
  constructor(model) {
    this.model = model;
    this.engine = new AIThinkingEngine(model);
  }

  async generateSearchQueries(query, maxQueries = 3) {
    const prompt = `<thinking>
I need to create effective search queries for: "${query}"

I should generate ${maxQueries} different search queries that:
1. Cover different aspects of the question
2. Use varied keywords and phrases
3. Include specific and general approaches
4. Target different types of sources

Generating optimal search queries...
</thinking>

Search queries:
1.
2.
3.`;

    try {
      const result = await ollamaGenerate({
        model: this.model,
        prompt,
        timeout: 30000
      });

      const thinking = this.engine.parseThinkingResponse(result.response || '');
      const queries = this.extractQueriesFromResponse(thinking.response);
      
      return {
        queries: queries.slice(0, maxQueries),
        thoughts: thinking.thoughts
      };
    } catch (error) {
      debugLog('Query generation error:', error.message);
      return {
        queries: [query], // Fallback to original query
        thoughts: [{ content: `Failed to generate search queries: ${error.message}`, type: 'error' }]
      };
    }
  }

  extractQueriesFromResponse(response) {
    const lines = response.split('\n').filter(line => line.trim());
    const queries = [];
    
    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(.+)$/) || line.match(/^[-•*]\s*(.+)$/);
      if (match && match[1]) {
        queries.push(match[1].trim());
      }
    }
    
    return queries.length ? queries : [response.split('\n')[0] || ''];
  }

  async executeSearches(queries, options = {}) {
    const results = [];
    const allSources = [];
    
    for (const query of queries) {
      try {
        const searchResults = await webSearch(query, options);
        if (searchResults.length > 0) {
          results.push({
            query,
            results: searchResults,
            count: searchResults.length
          });
          allSources.push(...searchResults);
        }
      } catch (error) {
        debugLog('Search execution error for query:', query, error.message);
      }
    }
    
    return {
      searchResults: results,
      allSources: this.deduplicateSources(allSources),
      totalSources: allSources.length
    };
  }

  deduplicateSources(sources) {
    const seen = new Set();
    return sources.filter(source => {
      const key = source.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async shouldContinueSearching(query, currentResults, complexity = 'medium') {
    // Simple heuristic-based decision making
    try {
      const resultCount = Array.isArray(currentResults) ? currentResults.length : 0;
      
      // Decision logic based on result count and complexity
      let shouldContinue = false;
      let reason = '';
      let confidence = 0.5;
      
      if (resultCount === 0) {
        shouldContinue = true;
        reason = 'No results found, continue searching';
        confidence = 0.9;
      } else if (resultCount < 3) {
        shouldContinue = complexity === 'high';
        reason = `Found ${resultCount} results, ${shouldContinue ? 'continue for more comprehensive coverage' : 'sufficient for basic query'}`;
        confidence = 0.7;
      } else if (resultCount < 8) {
        shouldContinue = complexity === 'high' && resultCount < 5;
        reason = `Found ${resultCount} results, ${shouldContinue ? 'continue for high complexity query' : 'sufficient coverage achieved'}`;
        confidence = 0.8;
      } else {
        shouldContinue = false;
        reason = `Found ${resultCount} results, sufficient coverage achieved`;
        confidence = 0.9;
      }

      const thoughts = [{
        content: `Search continuation analysis: ${reason} (${resultCount} results, complexity: ${complexity})`,
        type: 'search_decision',
        timestamp: nowISO()
      }];

      debugLog('Search continuation decision:', shouldContinue, reason, `(${resultCount} results)`);
      
      return {
        shouldContinue,
        reason,
        confidence,
        thoughts,
        resultCount
      };
    } catch (error) {
      debugLog('Search continuation decision error:', error.message);
      return {
        shouldContinue: false,
        reason: `Decision error: ${error.message}`,
        confidence: 0.3,
        thoughts: [{ content: `Error in search continuation: ${error.message}`, type: 'error' }],
        resultCount: 0
      };
    }
  }
}

// Cosine similarity calculation
function cosSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Enhanced session management
async function createSession(name = null, model = CHAT_MODEL) {
  const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sessionData = {
    id,
    name: name || `Chat ${new Date().toLocaleString()}`,
    model: model || CHAT_MODEL,
    created: nowISO(),
    updated: nowISO(),
    messages: [],
    settings: {
      autoSearch: true,
      useMemory: true,
      temperature: 0.7,
      titleAutoGenerated: false
    }
  };

  const file = path.join(sessionsDir, `${id}.json`);
  await writeJSON(file, sessionData);
  debugLog('Created session:', id);
  return sessionData;
}

async function loadSession(id) {
  const file = path.join(sessionsDir, `${id}.json`);
  
  try {
    const data = await readJSON(file);
    
    if (!data.model) data.model = CHAT_MODEL;
    if (!data.settings) {
      data.settings = { 
        autoSearch: true, 
        useMemory: true, 
        temperature: 0.7, 
        titleAutoGenerated: false 
      };
    }
    if (!data.messages) data.messages = [];
    
    return { file, data };
  } catch (error) {
    const defaultData = {
      id,
      name: `Chat ${new Date().toLocaleString()}`,
      model: CHAT_MODEL,
      created: nowISO(),
      updated: nowISO(),
      messages: [],
      settings: { 
        autoSearch: true, 
        useMemory: true, 
        temperature: 0.7, 
        titleAutoGenerated: false 
      }
    };
    await writeJSON(file, defaultData);
    return { file, data: defaultData };
  }
}

async function saveSession(file, data) {
  data.updated = nowISO();
  await writeJSON(file, data);
}

async function listSessions(limit = 50) {
  try {
    const files = await fs.readdir(sessionsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).slice(0, limit);
    const sessions = [];

    for (const file of jsonFiles) {
      try {
        const data = await readJSON(path.join(sessionsDir, file));
        sessions.push({
          id: data.id,
          name: data.name,
          model: data.model,
          created: data.created,
          updated: data.updated,
          messageCount: data.messages?.length || 0,
          lastMessage: data.messages?.length > 0 
            ? data.messages[data.messages.length - 1]?.content?.slice(0, 100) 
            : null
        });
      } catch (error) {
        debugLog('Error reading session file:', file, error.message);
      }
    }

    return sessions.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  } catch (error) {
    debugLog('Error listing sessions:', error.message);
    return [];
  }
}

// Enhanced memory management with improved RAG
async function loadMemory() {
  try {
    return await readJSON(memoryFile);
  } catch (error) {
    const init = { longTerm: [], nextId: 1 };
    await writeJSON(memoryFile, init);
    return init;
  }
}

async function saveMemory(memory) {
  await writeJSON(memoryFile, memory);
}

async function retrieveLongTermMemory(query, k = 5, minSim = 0.3) {
  try {
    const memory = await loadMemory();
    if (!memory.longTerm.length) return [];

    const [queryEmbedding] = await ollamaEmbed(query);
    if (!queryEmbedding) return [];

    const results = memory.longTerm
      .filter(item => item.embedding && Array.isArray(item.embedding))
      .map(item => ({
        ...item,
        similarity: cosSim(queryEmbedding, item.embedding)
      }))
      .filter(item => item.similarity >= minSim)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);

    debugLog('Memory retrieval:', query.slice(0, 50), 'found', results.length, 'items');
    return results;
  } catch (error) {
    debugLog('Memory retrieval error:', error.message);
    return [];
  }
}

async function upsertLongTermMemory(memoryItems) {
  try {
    if (!Array.isArray(memoryItems) || memoryItems.length === 0) {
      debugLog('No valid memory items to upsert');
      return [];
    }

    const memory = await loadMemory();
    const added = [];
    
    for (const item of memoryItems) {
      if (!item || typeof item !== 'object' || !item.content) {
        debugLog('Skipping invalid memory item:', item);
        continue;
      }

      // Generate embedding for the memory item
      let embedding = null;
      try {
        const [itemEmbedding] = await ollamaEmbed(item.content);
        embedding = itemEmbedding;
      } catch (embedError) {
        debugLog('Failed to generate embedding for memory item:', embedError.message);
        // Continue without embedding - the item can still be stored
      }

      // Check for duplicates based on content similarity
      let isDuplicate = false;
      if (embedding && memory.longTerm.length > 0) {
        for (const existing of memory.longTerm) {
          if (existing.embedding && Array.isArray(existing.embedding)) {
            const similarity = cosSim(embedding, existing.embedding);
            if (similarity > 0.95) { // Very high similarity threshold for duplicates
              isDuplicate = true;
              debugLog('Skipping duplicate memory item (similarity:', similarity.toFixed(3), ')');
              break;
            }
          }
        }
      }

      if (!isDuplicate) {
        const memoryItem = {
          id: memory.nextId++,
          content: item.content,
          type: item.type || 'general',
          importance: item.importance || 'medium',
          tags: item.tags || [],
          timestamp: nowISO(),
          embedding: embedding,
          source: item.source || 'system'
        };

        memory.longTerm.push(memoryItem);
        added.push(memoryItem);
        debugLog('Added memory item:', memoryItem.id, 'content:', memoryItem.content.slice(0, 50));
      }
    }

    // Save updated memory
    if (added.length > 0) {
      await saveMemory(memory);
      debugLog('Successfully upserted', added.length, 'memory items');
    }

    return added;
  } catch (error) {
    debugLog('Memory upsert error:', error.message);
    return [];
  }
}

// Enhanced web search functions
async function webSearch(query, { count = 10, timeout = 30000 } = {}) {
  debugLog('Web search:', query);
  
  const searchUrls = [
    `${SEARXNG}/search?q=${encodeURIComponent(query)}&format=json&language=en&safesearch=1`,
    `${SEARXNG}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,duckduckgo`,
    `${SEARXNG}/?q=${encodeURIComponent(query)}&format=json`
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    for (const url of searchUrls) {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; EvolveUI/2.0)',
            'Accept': 'application/json'
          }
        });

        if (!response.ok) continue;

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) continue;

        const json = await response.json();
        const results = (json.results || [])
          .filter(r => r.url?.startsWith('http'))
          .slice(0, count)
          .map(r => ({
            title: (r.title || r.url).trim(),
            url: r.url.trim(),
            snippet: (r.content || r.snippet || '').trim()
          }));

        clearTimeout(timeoutId);
        if (results.length > 0) {
          debugLog('Search successful:', results.length, 'results');
          return results;
        }
      } catch (urlError) {
        debugLog('Search URL failed:', url, urlError.message);
        continue;
      }
    }

    clearTimeout(timeoutId);
    return [];
  } catch (error) {
    clearTimeout(timeoutId);
    debugLog('Search error:', error.message);
    return [];
  }
}

async function fetchAndClean(url, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EvolveUI/2.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    clearTimeout(timeoutId);
    if (!response.ok) return '';
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return '';

    const html = await response.text();
    const $ = cheerio.load(html);

    $('script, style, noscript, nav, footer, aside, header').remove();
    $('.advertisement, .ads, .popup, .sidebar, .menu').remove();

    const mainContent = $('main, article, .content, .post, .entry, [role="main"]').first();
    const text = mainContent.length ? mainContent.text() : $('body').text();

    return text
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20000);
  } catch (error) {
    clearTimeout(timeoutId);
    debugLog('Fetch error for', url, ':', error.message);
    return '';
  }
}

// === MAIN CHAT ENDPOINT ===
app.post('/api/chat', chatLimiter, validateChatInput, async (req, res) => {
  const startTime = Date.now();
  debugLog('Enhanced chat request started');

  try {
    const {
      sessionId,
      message,
      model = CHAT_MODEL,
      autoSearch = true,
      useMemory = true,
      fileContent = null,
      stream: clientWantsStream = true
    } = req.body;

    const wantStreaming = clientWantsStream || req.headers.accept?.includes('text/event-stream');
    const { file, data } = await loadSession(sessionId);
    const history = data.messages || [];

    // Initialize AI thinking engine and smart search
    const thinkingEngine = new AIThinkingEngine(model);
    const smartSearch = new SmartWebSearch(model);

    let userMessage = message;
    if (fileContent) {
      userMessage = `File content:\n\`\`\`\n${fileContent.slice(0, 50000)}\n\`\`\`\n\nUser question: ${message}`;
    }

    // Memory retrieval with enhanced RAG
    let memoryContext = '';
    let retrievedMemory = [];
    if (useMemory) {
      try {
        retrievedMemory = await retrieveLongTermMemory(userMessage, 8, 0.25);
        if (retrievedMemory.length) {
          memoryContext = 'Relevant context from memory:\n' + 
            retrievedMemory
              .map((m, i) => `${i + 1}. ${m.content} (relevance: ${m.similarity.toFixed(2)})`)
              .join('\n');
          debugLog('Enhanced memory context loaded:', retrievedMemory.length, 'items');
        }
      } catch (memoryError) {
        debugLog('Memory retrieval error:', memoryError.message);
      }
    }

    // Initialize response variables
    let finalAnswer = '';
    let sources = [];
    let allThoughts = [];
    let usedSearch = false;
    let memoryAdded = [];
    let searchQueries = [];

    // Set up streaming response
    if (wantStreaming) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const sendSSE = (event, data) => {
        try {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
          debugLog('SSE write error:', error.message);
        }
      };

      try {
        // Phase 1: Query Analysis
        sendSSE('thinking_start', { phase: 'analysis', message: 'Analyzing your query...' });
        
        const queryAnalysis = await thinkingEngine.analyzeQuery(userMessage, memoryContext);
        allThoughts.push(...queryAnalysis.thoughts);
        
        sendSSE('thinking_update', { 
          phase: 'analysis', 
          thoughts: queryAnalysis.thoughts,
          analysis: queryAnalysis.analysis 
        });

        // Phase 2: Search Decision and Execution
        let searchDecision = { needsSearch: false };
        if (autoSearch && !fileContent) {
          sendSSE('thinking_start', { phase: 'search_decision', message: 'Determining if web search is needed...' });
          
          searchDecision = await thinkingEngine.determineSearchNeed(userMessage, memoryContext);
          allThoughts.push(...(searchDecision.thoughts || []));
          
          sendSSE('thinking_update', { 
            phase: 'search_decision', 
            decision: searchDecision,
            thoughts: searchDecision.thoughts || []
          });

          if (searchDecision.needsSearch) {
            usedSearch = true;
            
            // Generate multiple search queries
            sendSSE('thinking_start', { phase: 'search_planning', message: 'Planning search strategy...' });
            
            const queryGeneration = await smartSearch.generateSearchQueries(userMessage, 3);
            searchQueries = queryGeneration.queries;
            allThoughts.push(...queryGeneration.thoughts);
            
            sendSSE('thinking_update', { 
              phase: 'search_planning', 
              queries: searchQueries,
              thoughts: queryGeneration.thoughts 
            });

            // Execute searches iteratively
            let allSearchResults = [];
            let searchRound = 1;
            
            for (const query of searchQueries) {
              sendSSE('search_start', { 
                query, 
                round: searchRound, 
                total: searchQueries.length 
              });
              
              const results = await webSearch(query, { count: 8 });
              if (results.length > 0) {
                allSearchResults.push(...results);
                sendSSE('search_results', { 
                  query, 
                  results: results.length,
                  total: allSearchResults.length 
                });
              }
              
              // Check if we should continue searching
              if (searchRound < searchQueries.length) {
                const continueDecision = await smartSearch.shouldContinueSearching(
                  userMessage, 
                  allSearchResults, 
                  'high'
                );
                
                allThoughts.push(...(continueDecision.thoughts || []));
                
                if (!continueDecision.shouldContinue) {
                  sendSSE('search_complete', { 
                    reason: 'Sufficient results found',
                    totalResults: allSearchResults.length 
                  });
                  break;
                }
              }
              
              searchRound++;
            }

            // Fetch and process content from top sources
            if (allSearchResults.length > 0) {
              sendSSE('content_processing', { message: 'Processing search results...' });
              
              const topResults = allSearchResults.slice(0, 6);
              const contentPromises = topResults.map(async (result, index) => {
                const content = await fetchAndClean(result.url);
                return { ...result, content, index: index + 1 };
              });

              const contentResults = await Promise.allSettled(contentPromises);
              const validResults = contentResults
                .filter(result => result.status === 'fulfilled' && result.value.content.length > 300)
                .map(result => result.value);

              sources = validResults.map(r => ({ 
                idx: r.index, 
                title: r.title, 
                url: r.url 
              }));

              if (validResults.length > 0) {
                // Generate comprehensive answer using search results
                sendSSE('response_generation', { message: 'Synthesizing information...' });
                
                const context = validResults
                  .map(r => `[Source ${r.index}] ${r.title}\nURL: ${r.url}\nContent: ${r.content}`)
                  .join('\n\n---\n\n');

                const systemMessage = {
                  role: 'system',
                  content: `You are Evolve, a helpful AI assistant. Use the provided sources to answer the user's question comprehensively. 
                  
Format your response with:
- Clear, well-structured information
- Proper citations using [1], [2], etc.
- Markdown formatting for readability
- Critical analysis where appropriate

${memoryContext ? `\nRelevant context: ${memoryContext}` : ''}`
                };

                const searchPrompt = `Based on the following sources, provide a comprehensive answer to: "${userMessage}"

Sources:
${context}

Please provide a detailed, well-cited response:`;

                const response = await ollamaChat({
                  model,
                  messages: [
                    systemMessage,
                    { role: 'user', content: searchPrompt }
                  ],
                  stream: true
                });

                sendSSE('response_start', {});
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;

                  const chunk = decoder.decode(value);
                  buffer += chunk;

                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                      const data = JSON.parse(line);
                      const content = data.message?.content || data.content || '';
                      
                      if (content) {
                        finalAnswer += content;
                        sendSSE('response_chunk', { content });
                      }
                    } catch (e) {
                      finalAnswer += line;
                      sendSSE('response_chunk', { content: line });
                    }
                  }
                }
                
                sendSSE('response_complete', {});
              }
            }
          }
        }

        // Phase 3: Regular chat if no search or search failed
        if (!usedSearch || !finalAnswer.trim()) {
          sendSSE('thinking_start', { phase: 'response_planning', message: 'Planning response...' });
          
          const responsePlan = await thinkingEngine.planResponse(
            userMessage, 
            queryAnalysis.analysis, 
            sources, 
            memoryContext
          );
          allThoughts.push(...responsePlan.thoughts);
          
          sendSSE('thinking_update', { 
            phase: 'response_planning', 
            plan: responsePlan.plan,
            thoughts: responsePlan.thoughts 
          });

          sendSSE('response_start', {});
          
          const systemMessage = {
            role: 'system',
            content: `You are Evolve, a helpful AI assistant. Provide accurate, well-structured responses using Markdown formatting.
            
${memoryContext ? `Relevant context: ${memoryContext}` : ''}

Be conversational but informative. If you need to think through complex problems, use <thinking></thinking> tags.`
          };

          const contextMessages = [
            systemMessage,
            ...history.slice(-20),
            { role: 'user', content: userMessage }
          ];

          const response = await ollamaChat({
            model,
            messages: contextMessages,
            stream: true
          });

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const data = JSON.parse(line);
                const content = data.message?.content || data.content || '';
                
                if (content) {
                  finalAnswer += content;
                  
                  // Handle thinking tags in real-time
                  if (content.includes('<thinking>') || content.includes('</thinking>')) {
                    const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/g);
                    if (thinkingMatch) {
                      const thoughts = thinkingMatch.map(match => {
                        const thoughtContent = match.replace(/<\/?thinking>/g, '').trim();
                        return { content: thoughtContent, type: 'reasoning', timestamp: nowISO() };
                      });
                      allThoughts.push(...thoughts);
                      sendSSE('thinking_stream', { thoughts });
                    }
                    
                    const cleanContent = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
                    if (cleanContent.trim()) {
                      sendSSE('response_chunk', { content: cleanContent });
                    }
                  } else {
                    sendSSE('response_chunk', { content });
                  }
                }
              } catch (e) {
                finalAnswer += line;
                sendSSE('response_chunk', { content: line });
              }
            }
          }
          
          sendSSE('response_complete', {});
        }

        // Phase 4: Response Evaluation
        if (finalAnswer.trim()) {
          sendSSE('thinking_start', { phase: 'evaluation', message: 'Evaluating response quality...' });
          
          const evaluation = await thinkingEngine.evaluateResponse(userMessage, finalAnswer, sources);
          allThoughts.push(...evaluation.thoughts);
          
          sendSSE('thinking_update', { 
            phase: 'evaluation', 
            evaluation: evaluation.evaluation,
            thoughts: evaluation.thoughts 
          });
        }

        // Clean up thinking tags from final answer
        const thinkingRegex = /<thinking>[\s\S]*?<\/thinking>/g;
        finalAnswer = finalAnswer.replace(thinkingRegex, '').trim();

        // Save conversation
        const userMsg = {
          role: 'user',
          content: message,
          time: nowISO(),
          id: `msg_${Date.now()}_user`
        };

        const assistantMsg = {
          role: 'assistant',
          content: finalAnswer,
          time: nowISO(),
          usedSearch,
          thoughts: allThoughts,
          sources,
          searchQueries,
          id: `msg_${Date.now()}_assistant`
        };

        data.messages = [...history, userMsg, assistantMsg];
        await saveSession(file, data);

        // Auto-generate title
        try {
          const userMessageCount = data.messages.filter(m => m.role === 'user').length;
          if (userMessageCount >= 2 && !data.settings?.titleAutoGenerated) {
            const titlePrompt = `Generate a concise title (4-6 words) for this conversation. Return only the title:

Recent messages:
${data.messages.slice(-4).map(m => `${m.role}: ${m.content.slice(0, 100)}`).join('\n')}

Title:`;

            const titleResult = await ollamaGenerate({ model, prompt: titlePrompt, timeout: 20000 });
            const title = (titleResult.response || '').split('\n')[0].trim().replace(/[.?!]+$/, '');
            
            if (title && title.length > 3 && title !== data.name) {
              data.name = title.slice(0, 50);
              data.settings.titleAutoGenerated = true;
              await saveSession(file, data);
              sendSSE('title_updated', { title: data.name });
            }
          }
        } catch (titleError) {
          debugLog('Title generation error:', titleError.message);
        }

        // Extract and save enhanced memory
        if (useMemory && finalAnswer) {
          try {
            const memoryPrompt = `Extract important information to remember from this conversation for future reference.
Focus on user preferences, facts about the user, important context, and key insights.

User: ${userMessage}
Assistant: ${finalAnswer}

Return a JSON array of memory items with content, tags, and importance (0-1):
[{"content": "...", "tags": ["..."], "importance": 0.8}]`;

            const memoryResult = await ollamaGenerate({ model, prompt: memoryPrompt, timeout: 30000 });
            const memoryText = memoryResult.response || '[]';
            const jsonMatch = memoryText.match(/\[[\s\S]*\]/);
            
            if (jsonMatch) {
              const extracted = JSON.parse(jsonMatch[0]);
              if (Array.isArray(extracted)) {
                memoryAdded = await upsertLongTermMemory(extracted);
                if (memoryAdded.length > 0) {
                  sendSSE('memory_updated', { added: memoryAdded.length });
                }
              }
            }
          } catch (memoryError) {
            debugLog('Memory extraction error:', memoryError.message);
          }
        }

        // Send completion data
        sendSSE('complete', {
          usedSearch,
          sources: sources.length,
          thoughts: allThoughts.length,
          memoryAdded: memoryAdded.length,
          processingTime: Date.now() - startTime,
          searchQueries
        });

        res.end();
      } catch (streamError) {
        debugLog('Streaming error:', streamError.message);
        try {
          sendSSE('error', { message: streamError.message });
        } catch (e) {}
        res.end();
      }

      return;
    }

    // Non-streaming fallback (simplified)
    const queryAnalysis = await thinkingEngine.analyzeQuery(userMessage, memoryContext);
    allThoughts.push(...queryAnalysis.thoughts);

    if (autoSearch && !fileContent) {
      const searchDecision = await thinkingEngine.determineSearchNeed(userMessage, memoryContext);
      if (searchDecision.needsSearch) {
        usedSearch = true;
        const queryGeneration = await smartSearch.generateSearchQueries(userMessage, 2);
        searchQueries = queryGeneration.queries;
        
        const searchExecution = await smartSearch.executeSearches(searchQueries);
        if (searchExecution.allSources.length > 0) {
          sources = searchExecution.allSources.slice(0, 5).map((r, i) => ({ 
            idx: i + 1, 
            title: r.title, 
            url: r.url 
          }));
          
          const context = searchExecution.allSources
            .slice(0, 5)
            .map((r, i) => `[Source ${i + 1}] ${r.title}\n${r.snippet}`)
            .join('\n\n');

          const prompt = `Answer this question using the provided sources: "${userMessage}"

Sources:
${context}

${memoryContext ? `Context: ${memoryContext}` : ''}

Comprehensive answer:`;

          const result = await ollamaGenerate({ model, prompt });
          finalAnswer = result.response || '';
        }
      }
    }

    if (!finalAnswer.trim()) {
      const systemMessage = {
        role: 'system',
        content: `You are Evolve, a helpful AI assistant.${memoryContext ? `\n\nContext: ${memoryContext}` : ''}`
      };

      const response = await ollamaChat({
        model,
        messages: [systemMessage, ...history.slice(-20), { role: 'user', content: userMessage }],
        stream: false
      });
      finalAnswer = response.message?.content || '';
    }

    // Clean thinking tags and save
    const thinkingRegex = /<thinking>[\s\S]*?<\/thinking>/g;
    let cleanAnswer = finalAnswer;
    const thinkingMatches = finalAnswer.match(thinkingRegex);
    if (thinkingMatches) {
      for (const match of thinkingMatches) {
        const thoughtContent = match.replace(/<\/?thinking>/g, '').trim();
        allThoughts.push({ content: thoughtContent, type: 'reasoning', timestamp: nowISO() });
      }
      cleanAnswer = finalAnswer.replace(thinkingRegex, '').trim();
    }

    const userMsg = {
      role: 'user',
      content: message,
      time: nowISO(),
      id: `msg_${Date.now()}_user`
    };

    const assistantMsg = {
      role: 'assistant',
      content: cleanAnswer,
      time: nowISO(),
      usedSearch,
      thoughts: allThoughts,
      sources,
      searchQueries,
      id: `msg_${Date.now()}_assistant`
    };

    data.messages = [...history, userMsg, assistantMsg];
    await saveSession(file, data);

    res.json({
      answer: cleanAnswer,
      thoughts: allThoughts,
      sources,
      usedSearch,
      searchQueries,
      memoryAdded: memoryAdded.map(m => ({ content: m.content, tags: m.tags })),
      retrievedMemory: retrievedMemory.map(m => ({ content: m.content })),
      model,
      processingTime: Date.now() - startTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    debugLog('Enhanced chat error:', error.message, 'after', processingTime, 'ms');
    
    res.status(500).json({
      error: error.message,
      processingTime,
      debug: DEBUG ? { stack: error.stack } : undefined
    });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    timestamp: nowISO(),
    services: {
      ollama: OLLAMA,
      searxng: SEARXNG,
      debug: DEBUG
    },
    version: '2.2.0',
    features: {
      aiThinking: true,
      smartSearch: true,
      enhancedRAG: true,
      dynamicStreaming: true
    }
  });
});

// Models endpoint
app.get('/api/models', async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama not available: ${response.status}`);
    }

    const data = await response.json();
    let models = [];

    if (data && Array.isArray(data.models)) {
      models = data.models.map(m => typeof m === 'string' ? { name: m } : m);
    }

    res.json({ models });
  } catch (error) {
    debugLog('Models endpoint error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Session management endpoints
app.get('/api/sessions', async (_req, res) => {
  try {
    const sessions = await listSessions();
    res.json({ sessions, count: sessions.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const { data } = await loadSession(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { name, model } = req.body || {};
    const session = await createSession(name, model);
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const file = path.join(sessionsDir, `${req.params.id}.json`);
    await fs.unlink(file);
    res.json({ ok: true });
  } catch (error) {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.put('/api/sessions/:id/name', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({ error: 'Invalid name' });
    }

    const { file, data } = await loadSession(req.params.id);
    data.name = name.trim();
    await saveSession(file, data);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Memory endpoints
app.get('/api/memory', async (_req, res) => {
  try {
    const memory = await loadMemory();
    res.json({
      ...memory,
      stats: {
        totalItems: memory.longTerm.length,
        lastUpdated: memory.longTerm.length > 0 ? 
          memory.longTerm[memory.longTerm.length - 1].addedAt : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/memory/clear', async (_req, res) => {
  try {
    await writeJSON(memoryFile, { longTerm: [], nextId: 1 });
    res.json({ ok: true, clearedAt: nowISO() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File upload endpoint
app.post('/api/upload', uploadLimiter, upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];
    for (const file of req.files) {
      try {
        const content = await fs.readFile(file.path, 'utf-8');
        await fs.unlink(file.path).catch(() => {});

        results.push({
          filename: file.originalname,
          size: file.size,
          content: content.slice(0, 100000),
          uploadedAt: nowISO()
        });
      } catch (fileError) {
        results.push({
          filename: file.originalname,
          error: fileError.message
        });
      }
    }

    res.json({ files: results, uploadedAt: nowISO() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search test endpoint
app.get('/api/search/test', async (req, res) => {
  const query = req.query.q || 'test search';
  
  try {
    const results = await webSearch(query);
    res.json({
      query,
      searxng: SEARXNG,
      resultCount: results.length,
      results: results.slice(0, 3),
      timestamp: nowISO()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      searxng: SEARXNG,
      query
    });
  }
});

// Serve static files
app.use(express.static('.'));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public','index.html'));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public','index.html'));
});

// Error handler
app.use((error, _req, res, _next) => {
  debugLog('Express error:', error.message);
  res.status(500).json({
    error: 'Internal server error',
    message: DEBUG ? error.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Enhanced Evolve UI running at http://localhost:${PORT}`);
  console.log(`Configuration:
- Ollama:      ${OLLAMA}
- SearXNG:     ${SEARXNG}  
- Chat Model:  ${CHAT_MODEL}
- Embed Model: ${EMBED_MODEL}
- Debug:       ${DEBUG}`);

  console.log('\n✨ Enhanced Features:');
  console.log('  ✅ AI Thinking Models with real-time streaming');
  console.log('  ✅ Smart multi-query web search');
  console.log('  ✅ Dynamic response planning and evaluation'); 
  console.log('  ✅ Enhanced RAG with better similarity matching');
  console.log('  ✅ Live thinking process visualization');
  console.log('  ✅ Intelligent search decision making');
  console.log('  ✅ Improved memory extraction and storage');
  console.log('  ✅ Fixed copy and regenerate functionality');
  console.log('  ✅ Session management with auto-titles');

  console.log(`\n🔧 Test endpoints:
  - Health: http://localhost:${PORT}/api/health  
  - Search: http://localhost:${PORT}/api/search/test?q=hello
  - Memory: http://localhost:${PORT}/api/memory\n`);
});