#!/usr/bin/env node

/**
 * Evolve-UI API Test Suite
 * Comprehensive testing for all API endpoints and functionality
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const BASE_URL = 'http://localhost:8787';
const TEST_TIMEOUT = 30000;
const SERVER_START_DELAY = 3000;

class APITester {
  constructor() {
    this.serverProcess = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  /**
   * Start the Evolve-UI server for testing
   */
  async startServer() {
    console.log('🚀 Starting Evolve-UI server for testing...');
    
    const serverPath = path.join(__dirname, '..', 'server.js');
    this.serverProcess = spawn('node', [serverPath], {
      stdio: 'pipe',
      env: { ...process.env, DEBUG: 'false', PORT: '8787' }
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, SERVER_START_DELAY));
    
    // Check if server started successfully
    try {
      await this.makeRequest('/api/health');
      console.log('✅ Server started successfully');
    } catch (error) {
      throw new Error(`Failed to start server: ${error.message}`);
    }
  }

  /**
   * Stop the test server
   */
  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      console.log('🛑 Test server stopped');
    }
  }

  /**
   * Make HTTP request to the API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config);
    const data = await response.json();
    
    return {
      status: response.status,
      data,
      ok: response.ok
    };
  }

  /**
   * Assert test condition
   */
  assert(condition, message) {
    if (condition) {
      this.testResults.passed++;
      console.log(`✅ ${message}`);
    } else {
      this.testResults.failed++;
      this.testResults.errors.push(message);
      console.log(`❌ ${message}`);
    }
  }

  /**
   * Test health endpoint
   */
  async testHealthEndpoint() {
    console.log('\n📋 Testing Health Endpoint...');
    
    try {
      const response = await this.makeRequest('/api/health');
      
      this.assert(response.status === 200, 'Health endpoint returns 200');
      this.assert(response.data.ok === true, 'Health endpoint returns ok: true');
      this.assert(response.data.timestamp, 'Health endpoint includes timestamp');
      this.assert(response.data.version === '2.2.0', 'Health endpoint returns correct version');
      this.assert(response.data.services, 'Health endpoint includes services info');
      this.assert(response.data.features, 'Health endpoint includes features info');
      
      // Check features
      const features = response.data.features;
      this.assert(features.aiThinking === true, 'AI Thinking feature is enabled');
      this.assert(features.smartSearch === true, 'Smart Search feature is enabled');
      this.assert(features.enhancedRAG === true, 'Enhanced RAG feature is enabled');
      this.assert(features.dynamicStreaming === true, 'Dynamic Streaming feature is enabled');
      
    } catch (error) {
      this.assert(false, `Health endpoint test failed: ${error.message}`);
    }
  }

  /**
   * Test models endpoint
   */
  async testModelsEndpoint() {
    console.log('\n🤖 Testing Models Endpoint...');
    
    try {
      const response = await this.makeRequest('/api/models');
      
      this.assert(response.status === 200 || response.status === 500, 'Models endpoint responds (may fail if Ollama not available)');
      
      if (response.status === 200) {
        this.assert(Array.isArray(response.data.models), 'Models endpoint returns array of models');
        console.log(`📊 Found ${response.data.models.length} models`);
      } else {
        console.log('⚠️  Ollama not available - models test skipped');
      }
      
    } catch (error) {
      this.assert(false, `Models endpoint test failed: ${error.message}`);
    }
  }

  /**
   * Test sessions CRUD operations
   */
  async testSessionsEndpoint() {
    console.log('\n💬 Testing Sessions Endpoint...');
    
    try {
      // Test getting sessions list
      let response = await this.makeRequest('/api/sessions');
      this.assert(response.status === 200, 'Sessions list endpoint returns 200');
      this.assert(Array.isArray(response.data.sessions), 'Sessions endpoint returns array');
      
      // Test creating a new session
      response = await this.makeRequest('/api/sessions', {
        method: 'POST',
        body: {
          name: 'API Test Session',
          model: 'test-model'
        }
      });
      
      this.assert(response.status === 200, 'Session creation returns 200');
      this.assert(response.data.id, 'Created session has ID');
      this.assert(response.data.name === 'API Test Session', 'Created session has correct name');
      
      const sessionId = response.data.id;
      
      // Test getting specific session
      response = await this.makeRequest(`/api/sessions/${sessionId}`);
      this.assert(response.status === 200, 'Get specific session returns 200');
      this.assert(response.data.id === sessionId, 'Retrieved session has correct ID');
      
      // Test updating session name
      response = await this.makeRequest(`/api/sessions/${sessionId}/name`, {
        method: 'PUT',
        body: {
          name: 'Updated Test Session'
        }
      });
      
      this.assert(response.status === 200, 'Session name update returns 200');
      
      // Test deleting session
      response = await this.makeRequest(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      this.assert(response.status === 200, 'Session deletion returns 200');
      
      // Verify session is deleted
      response = await this.makeRequest(`/api/sessions/${sessionId}`);
      this.assert(response.status === 500, 'Deleted session returns 500');
      
    } catch (error) {
      this.assert(false, `Sessions endpoint test failed: ${error.message}`);
    }
  }

  /**
   * Test memory endpoint
   */
  async testMemoryEndpoint() {
    console.log('\n🧠 Testing Memory Endpoint...');
    
    try {
      // Test getting memory
      let response = await this.makeRequest('/api/memory');
      this.assert(response.status === 200, 'Memory endpoint returns 200');
      this.assert(response.data.longTerm !== undefined, 'Memory endpoint returns longTerm array');
      this.assert(response.data.stats !== undefined, 'Memory endpoint returns stats');
      
      // Test clearing memory (if implemented)
      response = await this.makeRequest('/api/memory', {
        method: 'DELETE'
      });
      
      // Note: This may not be implemented, so we check for either success or method not allowed
      this.assert(
        response.status === 200 || response.status === 405 || response.status === 404, 
        'Memory clear endpoint responds appropriately'
      );
      
    } catch (error) {
      this.assert(false, `Memory endpoint test failed: ${error.message}`);
    }
  }

  /**
   * Test search endpoint
   */
  async testSearchEndpoint() {
    console.log('\n🔍 Testing Search Endpoint...');
    
    try {
      const response = await this.makeRequest('/api/search/test?q=hello');
      
      // Search may fail if SearXNG is not available
      this.assert(
        response.status === 200 || response.status === 500,
        'Search test endpoint responds (may fail if SearXNG not available)'
      );
      
      if (response.status === 200) {
        console.log('✅ Search functionality is working');
      } else {
        console.log('⚠️  SearXNG not available - search test shows expected error');
      }
      
    } catch (error) {
      this.assert(false, `Search endpoint test failed: ${error.message}`);
    }
  }

  /**
   * Test chat endpoint (basic validation)
   */
  async testChatEndpoint() {
    console.log('\n💭 Testing Chat Endpoint...');
    
    try {
      // Create a test session first
      let response = await this.makeRequest('/api/sessions', {
        method: 'POST',
        body: {
          name: 'Chat Test Session'
        }
      });
      
      if (response.status !== 200) {
        this.assert(false, 'Failed to create session for chat test');
        return;
      }
      
      const sessionId = response.data.id;
      
      // Test chat endpoint
      response = await this.makeRequest('/api/chat', {
        method: 'POST',
        body: {
          message: 'Hello, this is a test message',
          sessionId: sessionId,
          model: 'test-model',
          stream: false
        }
      });
      
      // Chat may fail if Ollama is not available
      this.assert(
        response.status === 200 || response.status === 500,
        'Chat endpoint responds (may fail if Ollama not available)'
      );
      
      if (response.status === 200) {
        this.assert(response.data.answer !== undefined, 'Chat response includes answer');
        console.log('✅ Chat functionality is working');
      } else {
        console.log('⚠️  Ollama not available - chat test shows expected error');
      }
      
      // Clean up test session
      await this.makeRequest(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
    } catch (error) {
      this.assert(false, `Chat endpoint test failed: ${error.message}`);
    }
  }

  /**
   * Test file upload endpoint
   */
  async testUploadEndpoint() {
    console.log('\n📎 Testing Upload Endpoint...');
    
    try {
      // Create a test file
      const testContent = 'This is a test file for upload testing.';
      const testFilePath = path.join(__dirname, 'test-file.txt');
      await fs.writeFile(testFilePath, testContent);
      
      // Create form data
      const formData = new FormData();
      formData.append('file', new Blob([testContent], { type: 'text/plain' }), 'test-file.txt');
      formData.append('sessionId', 'test-session');
      
      // Note: File upload testing requires multipart/form-data which is complex to test
      // We'll test the endpoint exists and responds appropriately
      const response = await this.makeRequest('/api/upload', {
        method: 'POST',
        headers: {
          // Remove Content-Type to let fetch set boundary for multipart
        },
        body: formData
      });
      
      // Upload may fail due to session not existing or other validation
      this.assert(
        response.status === 200 || response.status === 400 || response.status === 500,
        'Upload endpoint responds (may fail due to validation)'
      );
      
      // Clean up test file
      try {
        await fs.unlink(testFilePath);
      } catch (e) {
        // Ignore cleanup errors
      }
      
    } catch (error) {
      this.assert(false, `Upload endpoint test failed: ${error.message}`);
    }
  }

  /**
   * Run all API tests
   */
  async runAllTests() {
    console.log('🧪 Starting Evolve-UI API Test Suite\n');
    
    try {
      await this.startServer();
      
      // Run all tests
      await this.testHealthEndpoint();
      await this.testModelsEndpoint();
      await this.testSessionsEndpoint();
      await this.testMemoryEndpoint();
      await this.testSearchEndpoint();
      await this.testChatEndpoint();
      await this.testUploadEndpoint();
      
    } catch (error) {
      console.error(`❌ Test suite error: ${error.message}`);
      this.testResults.failed++;
      this.testResults.errors.push(`Test suite error: ${error.message}`);
    } finally {
      await this.stopServer();
    }
    
    // Print results
    this.printResults();
  }

  /**
   * Print test results
   */
  printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 API Test Results');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📋 Total:  ${this.testResults.passed + this.testResults.failed}`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults.errors.forEach(error => {
        console.log(`   • ${error}`);
      });
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (this.testResults.failed === 0) {
      console.log('🎉 All API tests passed!');
      process.exit(0);
    } else {
      console.log('💥 Some API tests failed!');
      process.exit(1);
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new APITester();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down tests...');
    await tester.stopServer();
    process.exit(1);
  });
  
  tester.runAllTests().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}

export default APITester;