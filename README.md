# Evolve-UI 🚀

> **Next-Generation AI Chat Interface with Advanced Intelligence Features**

Evolve-UI is a sophisticated AI-powered chat interface that seamlessly integrates local language models with intelligent web search, persistent memory, and real-time thinking visualization. Built for power users who demand transparency, control, and advanced AI capabilities.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Version](https://img.shields.io/badge/version-2.2.0-orange.svg)

## ✨ Key Features

### 🧠 **AI Thinking Engine**
- **Real-time thinking visualization** with analysis, planning, and evaluation phases
- **Transparent reasoning process** showing how AI arrives at conclusions
- **Multi-phase thinking**: Query analysis → Search planning → Response generation → Quality evaluation
- **Streaming thought process** for immediate feedback and insight

### 🔍 **Smart Web Search**
- **Multi-query intelligent search** with automatic query generation
- **Context-aware search decisions** - AI determines when web search is needed
- **Advanced result processing** with content extraction and relevance filtering
- **SearXNG integration** for privacy-focused web search
- **Source citation** with proper attribution and links

### 🎯 **Enhanced RAG (Retrieval-Augmented Generation)**
- **Vector similarity-based memory retrieval** using cosine similarity matching
- **Intelligent context integration** with relevant information retrieval
- **Dynamic memory extraction** from conversations
- **Semantic search** across stored knowledge

### 💾 **Persistent Memory System**
- **Long-term memory storage** with automatic content extraction
- **Embedding-based retrieval** for contextually relevant information
- **Smart memory tagging** with automatic categorization
- **Memory analytics** with usage statistics and insights

### 📊 **Advanced Session Management**
- **Create, load, save, and delete** sessions with full CRUD operations
- **Auto-title generation** using AI-powered summarization
- **Session export/import** with full conversation history
- **Message threading** with proper conversation flow

### 📎 **File Upload & Processing**
- **Multi-format support**: Text, PDF, JSON, CSV, and more
- **Intelligent content extraction** with automatic processing
- **File-based conversations** with context-aware responses
- **Secure upload handling** with validation and storage

### ⚡ **Real-time Streaming**
- **Server-Sent Events (SSE)** for live response streaming
- **Progressive content delivery** with real-time updates
- **Live thinking updates** showing AI reasoning in real-time
- **Interactive response building** with immediate feedback

### 🎨 **Responsive & Modern UI**
- **Mobile-friendly interface** with touch-optimized controls
- **Dark/Light theme support** with system preference detection
- **Keyboard shortcuts** for power users
- **Collapsible sidebar** with session management
- **Real-time indicators** for processing status

### 🔒 **Enterprise-Grade Security**
- **Helmet.js security headers** with CSP protection
- **CORS configuration** for secure cross-origin requests
- **Rate limiting** to prevent abuse and ensure stability
- **Input validation** with comprehensive sanitization
- **Secure file handling** with type validation

### ⚡ **Performance Optimized**
- **Compression middleware** for faster data transfer
- **Connection pooling** for efficient resource usage
- **Optimized database queries** with proper indexing
- **Lazy loading** for improved initial load times
- **Caching strategies** for frequently accessed data

### 🛠 **Developer-Friendly**
- **Environment-based configuration** for all services
- **Comprehensive error handling** with detailed debugging
- **Extensive logging** with configurable debug levels
- **RESTful API design** with clear endpoint structure
- **Docker support** for easy deployment

## 🚀 Quick Start Guide

### Prerequisites

- **Node.js** (v18 or higher)
- **Ollama** (for local LLM serving)
- **SearXNG** (optional, for web search functionality)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/bfforex/Evolve-UI.git
cd Evolve-UI
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the application**
```bash
npm start
```

5. **Access the interface**
Open [http://localhost:8787](http://localhost:8787) in your browser

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=8787
NODE_ENV=development

# Ollama Configuration  
OLLAMA_URL=http://localhost:11434
CHAT_MODEL=llama3.2:3b
EMBED_MODEL=nomic-embed-text

# SearXNG Configuration
SEARXNG_URL=http://localhost:8080

# Debug Configuration
DEBUG=true

# Security Configuration
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=30
UPLOAD_LIMIT_MB=10
```

### Ollama Setup

1. **Install Ollama** from [ollama.ai](https://ollama.ai)

2. **Pull required models**
```bash
ollama pull llama3.2:3b        # Chat model
ollama pull nomic-embed-text   # Embedding model
```

3. **Start Ollama service**
```bash
ollama serve
```

### SearXNG Setup (Optional)

For web search functionality, set up SearXNG:

```bash
# Using Docker
docker run -d \
  --name searxng \
  -p 8080:8080 \
  searxng/searxng:latest
```

## 📖 Usage Examples

### Basic Chat
```javascript
// Send a simple message
POST /api/chat
{
  "message": "Explain quantum computing",
  "sessionId": "session_123",
  "model": "llama3.2:3b"
}
```

### Advanced Search Query
```javascript
// AI will automatically determine if web search is needed
POST /api/chat
{
  "message": "What are the latest developments in AI research?",
  "sessionId": "session_123",
  "useSearch": true
}
```

### Memory Integration
```javascript
// Add information to memory
POST /api/memory
{
  "content": "User prefers technical explanations",
  "tags": ["preference", "technical"]
}
```

### File Upload
```javascript
// Upload and process files
POST /api/upload
FormData: {
  file: document.pdf,
  sessionId: "session_123"
}
```

## 🔌 API Reference

### Core Endpoints

#### Health Check
```http
GET /api/health
```
Returns system status and configuration information.

#### Models Management  
```http
GET /api/models
```
Retrieves available Ollama models.

#### Chat Interface
```http
POST /api/chat
Content-Type: application/json

{
  "message": "Your question here",
  "sessionId": "session_id",
  "model": "model_name",
  "useSearch": true,
  "stream": true
}
```

#### Session Management
```http
# List sessions
GET /api/sessions

# Create session
POST /api/sessions
{
  "name": "Session Name",
  "model": "llama3.2:3b"
}

# Get session
GET /api/sessions/:id

# Update session name
PUT /api/sessions/:id/name
{
  "name": "New Name"
}

# Delete session
DELETE /api/sessions/:id
```

#### Memory Management
```http
# Get memory
GET /api/memory

# Clear memory
DELETE /api/memory

# Add memory item
POST /api/memory
{
  "content": "Information to remember",
  "tags": ["tag1", "tag2"]
}
```

#### File Upload
```http
POST /api/upload
Content-Type: multipart/form-data

Form data:
- file: File to upload
- sessionId: Target session ID
```

#### Search Testing
```http
GET /api/search/test?q=search_query
```

### Response Formats

#### Standard Response
```json
{
  "answer": "AI response content",
  "thoughts": [
    {
      "content": "Thinking process",
      "type": "analysis"
    }
  ],
  "sources": [
    {
      "title": "Source Title",
      "url": "https://example.com",
      "idx": 1
    }
  ],
  "usedSearch": true,
  "searchQueries": ["query1", "query2"],
  "memoryAdded": [],
  "retrievedMemory": [],
  "model": "llama3.2:3b",
  "processingTime": 1500
}
```

#### Streaming Events
```
event: thinking_start
data: {"phase": "analysis", "message": "Analyzing query..."}

event: search_start  
data: {"query": "search terms", "round": 1}

event: response_chunk
data: {"content": "partial response"}

event: response_complete
data: {"finalContent": "complete response"}
```

## 🏗 Architecture Overview

### System Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │────│   Express API   │────│   Ollama LLM    │
│   (index.html)  │    │   (server.js)   │    │   (Local)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
            ┌───────▼───┐ ┌───▼───┐ ┌───▼────┐
            │ SearXNG   │ │Memory │ │Sessions│
            │(Search)   │ │Store  │ │Store   │
            └───────────┘ └───────┘ └────────┘
```

### Component Breakdown

#### **AIThinkingEngine**
Manages the AI reasoning process with phases:
- Query analysis and understanding
- Search decision making  
- Response planning and generation
- Quality evaluation and improvement

#### **SmartWebSearch**
Handles intelligent web searching:
- Multi-query generation
- Result processing and filtering
- Source deduplication
- Content extraction

#### **Memory System**
Manages persistent knowledge:
- Vector embeddings for semantic search
- Automatic content extraction
- Similarity-based retrieval
- Long-term storage

#### **Session Manager**
Handles conversation state:
- CRUD operations for sessions
- Message threading
- Auto-title generation
- Export/import functionality

## 🧪 Testing Guide

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:api
npm run test:frontend  
npm run test:integration
npm run test:performance

# Run tests with coverage
npm run test:coverage
```

### Test Categories

#### API Tests (`test/api-tests.js`)
- Health endpoint validation
- Model retrieval testing
- Chat functionality testing
- Session CRUD operations
- Memory management testing
- File upload testing
- Search functionality testing

#### Frontend Tests (`test/frontend-tests.html`)
- Theme switching functionality
- Sidebar collapse/expand
- Session management UI
- Message sending/receiving
- File upload interface
- Settings panel functionality
- Keyboard shortcuts
- Mobile responsiveness

#### Integration Tests (`test/integration-tests.js`)
- Complete chat flow with search
- Memory storage and retrieval
- File upload and processing
- Session persistence
- Error handling and recovery

#### Performance Tests (`test/performance-tests.js`)
- Response time measurements
- Memory usage monitoring
- Concurrent request handling
- Large file upload testing

### Manual Testing

1. **Basic Chat Flow**
   - Send simple messages
   - Verify AI responses
   - Check thinking process visualization

2. **Advanced Features**
   - Test web search integration
   - Verify memory functionality
   - Upload and process files

3. **UI/UX Testing**
   - Test dark/light theme switching
   - Verify mobile responsiveness
   - Check keyboard shortcuts

## 🔧 Troubleshooting

### Common Issues

#### Ollama Connection Issues
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama service
ollama serve
```

#### SearXNG Search Errors
```bash
# Check SearXNG availability
curl http://localhost:8080/search?q=test&format=json

# Restart SearXNG container
docker restart searxng
```

#### Memory/Session Issues
```bash
# Clear data directory (will reset all sessions/memory)
rm -rf data/sessions/*
rm -f data/memory.json
```

#### Performance Issues
- Check available system memory
- Monitor Ollama resource usage
- Reduce concurrent request limits
- Optimize model selection

### Debug Mode

Enable debug mode for detailed logging:
```env
DEBUG=true
```

View debug output in server console:
```bash
npm start | grep DEBUG
```

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| 500  | Ollama unavailable | Check Ollama service |
| 429  | Rate limit exceeded | Reduce request frequency |
| 413  | File too large | Check upload size limits |
| 400  | Invalid request | Validate request format |

## 🤝 Contributing

### Development Setup

1. **Fork the repository**
2. **Create a feature branch**
```bash
git checkout -b feature/amazing-feature
```

3. **Install dependencies**
```bash
npm install
npm run dev  # Start with hot reload
```

4. **Make your changes**
5. **Run tests**
```bash
npm test
npm run lint
```

6. **Commit your changes**
```bash
git commit -m 'Add amazing feature'
```

7. **Push to the branch**
```bash
git push origin feature/amazing-feature
```

8. **Open a Pull Request**

### Code Style

- Follow ESLint configuration
- Use Prettier for formatting
- Add JSDoc comments for functions
- Write comprehensive tests
- Update documentation

### Pull Request Guidelines

- Include a clear description
- Reference related issues
- Add tests for new features
- Update documentation
- Ensure all tests pass

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai) for local LLM serving
- [SearXNG](https://docs.searxng.org/) for privacy-focused search
- [Express.js](https://expressjs.com/) for the web framework
- [Tailwind CSS](https://tailwindcss.com/) for styling

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/bfforex/Evolve-UI/issues)
- **Discussions**: [GitHub Discussions](https://github.com/bfforex/Evolve-UI/discussions)
- **Documentation**: [Wiki](https://github.com/bfforex/Evolve-UI/wiki)

---

<div align="center">
  <strong>Built with ❤️ for the AI community</strong><br>
  <sub>Evolve-UI - Where AI thinking meets human interaction</sub>
</div>
