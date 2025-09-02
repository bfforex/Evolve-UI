# Evolve-UI Troubleshooting Guide

## Common Issues and Solutions

### 1. Server Won't Start

**Problem**: `Error: listen EADDRINUSE :::8787`
**Solution**: 
```bash
# Kill process using port 8787
lsof -ti:8787 | xargs kill -9
# Or use a different port
PORT=8888 npm start
```

**Problem**: `Cannot find module 'xyz'`
**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### 2. Ollama Issues

**Problem**: `Ollama not available`
**Solution**:
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve

# Pull required models
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

**Problem**: `Model not found`
**Solution**:
```bash
# List available models
ollama list

# Pull the required model
ollama pull <model-name>

# Update .env file with correct model name
CHAT_MODEL=<your-model-name>
```

### 3. Search/SearXNG Issues

**Problem**: `Search functionality not working`
**Solution**:
```bash
# Start SearXNG with Docker
docker run -d --name searxng -p 8080:8080 searxng/searxng:latest

# Or disable search in .env
SEARXNG_URL=
```

**Problem**: `CORS errors in search`
**Solution**:
- Check SearXNG CORS settings
- Verify SEARXNG_URL in .env file

### 4. Memory/Session Issues

**Problem**: `Session not found`
**Solution**:
```bash
# Clear all sessions
rm -rf data/sessions/*

# Or check session directory permissions
chmod 755 data/sessions/
```

**Problem**: `Memory retrieval errors`
**Solution**:
```bash
# Reset memory file
rm data/memory.json
# Server will recreate it on restart
```

### 5. File Upload Issues

**Problem**: `File upload fails`
**Solution**:
- Check file size (default limit: 10MB)
- Verify uploads directory exists: `mkdir -p data/uploads`
- Check file permissions

**Problem**: `Unsupported file type`
**Solution**:
- Currently supported: txt, pdf, json, csv, md
- Check multer configuration in server.js

### 6. Performance Issues

**Problem**: `Slow response times`
**Solution**:
- Check available system memory
- Monitor Ollama resource usage
- Reduce concurrent requests
- Use lighter models

**Problem**: `High memory usage`
**Solution**:
```bash
# Clear memory periodically
curl -X DELETE http://localhost:8787/api/memory

# Reduce model size
CHAT_MODEL=llama3.2:1b
```

### 7. Testing Issues

**Problem**: `Tests fail to start server`
**Solution**:
- Ensure port 8787 is available
- Check if another instance is running
- Verify all dependencies are installed

**Problem**: `API tests timeout`
**Solution**:
- Increase timeout in test files
- Check server startup time
- Verify network connectivity

### 8. Development Issues

**Problem**: `ESLint errors`
**Solution**:
```bash
# Auto-fix most issues
npm run lint:fix

# Or disable specific rules in .eslintrc.json
```

**Problem**: `Module import errors`
**Solution**:
- Ensure "type": "module" in package.json
- Use .js extensions in imports
- Check Node.js version (requires >=18)

### 9. Environment Configuration

**Problem**: `Environment variables not loaded`
**Solution**:
```bash
# Copy example configuration
cp .env.example .env

# Edit with your settings
nano .env

# Verify loading
node -e "console.log(process.env.PORT)"
```

### 10. Browser Issues

**Problem**: `Interface not loading`
**Solution**:
- Check browser console for errors
- Verify server is running on correct port
- Clear browser cache
- Check Content Security Policy settings

**Problem**: `WebSocket/SSE errors`
**Solution**:
- Check browser support for Server-Sent Events
- Verify network/proxy settings
- Check CORS configuration

## Debug Mode

Enable debug mode for detailed logging:
```bash
DEBUG=true npm start
```

Or in .env file:
```
DEBUG=true
```

## Performance Monitoring

Check system resources:
```bash
# Monitor server process
top -p $(pgrep -f "node server.js")

# Check memory usage
free -h

# Monitor disk space
df -h
```

## Getting Help

1. **Check Logs**: Look at server console output
2. **Enable Debug**: Set `DEBUG=true` for detailed logs
3. **Test Components**: Use individual test suites
4. **Community**: Open issues on GitHub repository
5. **Documentation**: Refer to README.md for setup details

## Useful Commands

```bash
# Full restart
npm stop && npm start

# Run specific tests
npm run test:api
npm run test:integration
npm run test:performance

# Check configuration
node -e "console.log(JSON.stringify(process.env, null, 2))"

# Verify dependencies
npm audit

# Clean install
rm -rf node_modules package-lock.json && npm install
```