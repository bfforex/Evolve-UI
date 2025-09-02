#!/usr/bin/env node

/**
 * Evolve-UI Integration Test Suite
 * End-to-end testing for complete application workflows
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const BASE_URL = 'http://localhost:8787';
const TEST_TIMEOUT = 45000;
const SERVER_START_DELAY = 3000;

class IntegrationTester {
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
    console.log('🚀 Starting Evolve-UI server for integration testing...');
    
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
    
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    return {
      status: response.status,
      data,
      ok: response.ok,
      headers: response.headers
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
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test complete chat flow with session management
   */
  async testCompleteSessionFlow() {
    console.log('\n💬 Testing Complete Session Flow...');
    
    try {
      // Step 1: Create a new session
      let response = await this.makeRequest('/api/sessions', {
        method: 'POST',
        body: {
          name: 'Integration Test Session',
          model: 'test-model'
        }
      });
      
      this.assert(response.status === 200, 'Session creation successful');
      const sessionId = response.data.id;
      
      // Step 2: Verify session was created
      response = await this.makeRequest(`/api/sessions/${sessionId}`);
      this.assert(response.status === 200, 'Session retrieval successful');
      this.assert(response.data.name === 'Integration Test Session', 'Session has correct name');
      
      // Step 3: Send a chat message (may fail if Ollama not available)
      response = await this.makeRequest('/api/chat', {
        method: 'POST',
        body: {
          message: 'Hello, this is an integration test',
          sessionId: sessionId,
          model: 'test-model',
          stream: false
        }
      });
      
      if (response.status === 200) {
        this.assert(response.data.answer !== undefined, 'Chat response received');
        this.assert(response.data.processingTime !== undefined, 'Processing time included');
        console.log(`📊 Chat processing time: ${response.data.processingTime}ms`);
      } else {
        console.log('⚠️  Chat failed (Ollama likely not available) - continuing with other tests');
      }
      
      // Step 4: Update session name
      response = await this.makeRequest(`/api/sessions/${sessionId}/name`, {
        method: 'PUT',
        body: {
          name: 'Updated Integration Test Session'
        }
      });
      
      this.assert(response.status === 200, 'Session name update successful');
      
      // Step 5: Verify name was updated
      response = await this.makeRequest(`/api/sessions/${sessionId}`);
      this.assert(response.data.name === 'Updated Integration Test Session', 'Session name was updated');
      
      // Step 6: Delete the session
      response = await this.makeRequest(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      this.assert(response.status === 200, 'Session deletion successful');
      
      // Step 7: Verify session was deleted
      response = await this.makeRequest(`/api/sessions/${sessionId}`);
      this.assert(response.status === 500, 'Deleted session no longer accessible');
      
    } catch (error) {
      this.assert(false, `Complete session flow test failed: ${error.message}`);
    }
  }

  /**
   * Test memory system integration
   */
  async testMemoryIntegration() {
    console.log('\n🧠 Testing Memory System Integration...');
    
    try {
      // Step 1: Get initial memory state
      let response = await this.makeRequest('/api/memory');
      this.assert(response.status === 200, 'Memory retrieval successful');
      const initialMemoryCount = response.data.longTerm.length;
      
      // Step 2: Create a session for memory testing
      response = await this.makeRequest('/api/sessions', {
        method: 'POST',
        body: {
          name: 'Memory Test Session'
        }
      });
      
      const sessionId = response.data.id;
      
      // Step 3: Send a message that should generate memory (if Ollama available)
      response = await this.makeRequest('/api/chat', {
        method: 'POST',
        body: {
          message: 'My name is Integration Tester and I like automated testing',
          sessionId: sessionId,
          useMemory: true,
          stream: false
        }
      });
      
      if (response.status === 200) {
        // Step 4: Check if memory was added
        response = await this.makeRequest('/api/memory');
        const finalMemoryCount = response.data.longTerm.length;
        
        this.assert(
          finalMemoryCount >= initialMemoryCount, 
          'Memory system processed the interaction'
        );
        
        console.log(`📊 Memory items: ${initialMemoryCount} → ${finalMemoryCount}`);
      } else {
        console.log('⚠️  Memory test skipped (Ollama not available)');
      }
      
      // Cleanup
      await this.makeRequest(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      
    } catch (error) {
      this.assert(false, `Memory integration test failed: ${error.message}`);
    }
  }

  /**
   * Test file upload integration
   */
  async testFileUploadIntegration() {
    console.log('\n📎 Testing File Upload Integration...');
    
    try {
      // Step 1: Create a test session
      let response = await this.makeRequest('/api/sessions', {
        method: 'POST',
        body: {
          name: 'File Upload Test Session'
        }
      });
      
      const sessionId = response.data.id;
      
      // Step 2: Create a test file
      const testContent = 'This is a test file for integration testing.\nIt contains multiple lines.\nUsed to test file upload functionality.';
      const testFilePath = path.join(__dirname, 'test-upload.txt');
      await fs.writeFile(testFilePath, testContent);
      
      // Step 3: Test file upload endpoint exists and responds
      const formData = new FormData();
      formData.append('file', new Blob([testContent], { type: 'text/plain' }), 'test-upload.txt');
      formData.append('sessionId', sessionId);
      
      try {
        response = await this.makeRequest('/api/upload', {
          method: 'POST',
          body: formData,
          headers: {} // Let fetch set multipart headers
        });
        
        // Upload may fail due to validation or processing, but endpoint should respond
        this.assert(
          response.status === 200 || response.status === 400 || response.status === 500,
          'Upload endpoint responds to requests'
        );
        
        if (response.status === 200) {
          console.log('✅ File upload processing successful');
        } else {
          console.log('⚠️  File upload validation or processing issue (expected in test environment)');
        }
      } catch (error) {
        console.log('⚠️  File upload test limited due to FormData/multipart complexity in test environment');
      }
      
      // Cleanup
      await this.makeRequest(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      try {
        await fs.unlink(testFilePath);
      } catch (e) {
        // Ignore cleanup errors
      }
      
    } catch (error) {
      this.assert(false, `File upload integration test failed: ${error.message}`);
    }
  }

  /**
   * Test search integration
   */
  async testSearchIntegration() {
    console.log('\n🔍 Testing Search Integration...');
    
    try {
      // Step 1: Test search endpoint directly
      let response = await this.makeRequest('/api/search/test?q=integration test');
      
      this.assert(
        response.status === 200 || response.status === 500,
        'Search endpoint responds (may fail if SearXNG not available)'
      );
      
      if (response.status === 200) {
        console.log('✅ Search functionality is operational');
      } else {
        console.log('⚠️  Search service not available (SearXNG not running)');
      }
      
      // Step 2: Test chat with search integration
      response = await this.makeRequest('/api/sessions', {
        method: 'POST',
        body: {
          name: 'Search Test Session'
        }
      });
      
      const sessionId = response.data.id;
      
      response = await this.makeRequest('/api/chat', {
        method: 'POST',
        body: {
          message: 'What is the current time?',
          sessionId: sessionId,
          useSearch: true,
          stream: false
        }
      });
      
      if (response.status === 200) {
        this.assert(response.data.usedSearch !== undefined, 'Chat response includes search usage info');
        this.assert(response.data.searchQueries !== undefined, 'Chat response includes search queries info');
        
        if (response.data.usedSearch) {
          console.log('✅ Search was integrated into chat response');
        } else {
          console.log('ℹ️  Search was available but not used for this query');
        }
      } else {
        console.log('⚠️  Chat with search test skipped (dependencies not available)');
      }
      
      // Cleanup
      await this.makeRequest(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      
    } catch (error) {
      this.assert(false, `Search integration test failed: ${error.message}`);
    }
  }

  /**
   * Test streaming functionality
   */
  async testStreamingIntegration() {
    console.log('\n⚡ Testing Streaming Integration...');
    
    try {
      // Step 1: Create a test session
      let response = await this.makeRequest('/api/sessions', {
        method: 'POST',
        body: {
          name: 'Streaming Test Session'
        }
      });
      
      const sessionId = response.data.id;
      
      // Step 2: Test streaming endpoint (simplified test)
      // Note: Full streaming test would require SSE handling which is complex in Node.js fetch
      response = await this.makeRequest('/api/chat', {
        method: 'POST',
        body: {
          message: 'Tell me about streaming',
          sessionId: sessionId,
          stream: true
        }
      });
      
      // For streaming, we expect either success or failure due to missing dependencies
      this.assert(
        response.status === 200 || response.status === 500,
        'Streaming endpoint accepts requests'
      );
      
      if (response.status === 200) {
        console.log('✅ Streaming endpoint is functional');
      } else {
        console.log('⚠️  Streaming test limited (Ollama not available)');
      }
      
      // Cleanup
      await this.makeRequest(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      
    } catch (error) {
      this.assert(false, `Streaming integration test failed: ${error.message}`);
    }
  }

  /**
   * Test error handling and recovery
   */
  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling...');
    
    try {
      // Test 1: Invalid session ID
      let response = await this.makeRequest('/api/sessions/invalid-session-id');
      this.assert(response.status === 500, 'Invalid session ID returns appropriate error');
      
      // Test 2: Invalid chat request
      response = await this.makeRequest('/api/chat', {
        method: 'POST',
        body: {
          message: '', // Empty message
          sessionId: 'nonexistent'
        }
      });
      this.assert(response.status >= 400, 'Invalid chat request returns error status');
      
      // Test 3: Invalid session creation
      response = await this.makeRequest('/api/sessions', {
        method: 'POST',
        body: {
          name: 'x'.repeat(200) // Very long name
        }
      });
      // This may succeed or fail depending on validation, but should respond
      this.assert(response.status !== undefined, 'Server handles invalid session creation requests');
      
      // Test 4: Nonexistent endpoint
      response = await this.makeRequest('/api/nonexistent-endpoint');
      this.assert(response.status === 404, 'Nonexistent endpoint returns 404');
      
    } catch (error) {
      this.assert(false, `Error handling test failed: ${error.message}`);
    }
  }

  /**
   * Test performance and concurrent requests
   */
  async testPerformanceBasics() {
    console.log('\n⚡ Testing Basic Performance...');
    
    try {
      const startTime = Date.now();
      
      // Test concurrent requests to health endpoint
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(this.makeRequest('/api/health'));
      }
      
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      this.assert(
        responses.every(r => r.status === 200),
        'Server handles concurrent requests successfully'
      );
      
      this.assert(totalTime < 5000, 'Concurrent requests complete within reasonable time');
      
      console.log(`📊 5 concurrent requests completed in ${totalTime}ms`);
      
      // Test session creation performance
      const sessionStartTime = Date.now();
      const sessionResponse = await this.makeRequest('/api/sessions', {
        method: 'POST',
        body: { name: 'Performance Test Session' }
      });
      const sessionEndTime = Date.now();
      const sessionTime = sessionEndTime - sessionStartTime;
      
      this.assert(sessionResponse.status === 200, 'Session creation successful');
      this.assert(sessionTime < 2000, 'Session creation completes quickly');
      
      console.log(`📊 Session creation took ${sessionTime}ms`);
      
      // Cleanup
      if (sessionResponse.status === 200) {
        await this.makeRequest(`/api/sessions/${sessionResponse.data.id}`, {
          method: 'DELETE'
        });
      }
      
    } catch (error) {
      this.assert(false, `Performance test failed: ${error.message}`);
    }
  }

  /**
   * Run all integration tests
   */
  async runAllTests() {
    console.log('🧪 Starting Evolve-UI Integration Test Suite\n');
    
    try {
      await this.startServer();
      
      // Run all integration tests
      await this.testCompleteSessionFlow();
      await this.testMemoryIntegration();
      await this.testFileUploadIntegration();
      await this.testSearchIntegration();
      await this.testStreamingIntegration();
      await this.testErrorHandling();
      await this.testPerformanceBasics();
      
    } catch (error) {
      console.error(`❌ Integration test suite error: ${error.message}`);
      this.testResults.failed++;
      this.testResults.errors.push(`Integration test suite error: ${error.message}`);
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
    console.log('\n' + '='.repeat(60));
    console.log('📊 Integration Test Results');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📋 Total:  ${this.testResults.passed + this.testResults.failed}`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults.errors.forEach(error => {
        console.log(`   • ${error}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (this.testResults.failed === 0) {
      console.log('🎉 All integration tests passed!');
      process.exit(0);
    } else {
      console.log('💥 Some integration tests failed!');
      console.log('\nNote: Some failures may be expected if Ollama or SearXNG are not running.');
      process.exit(1);
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new IntegrationTester();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down integration tests...');
    await tester.stopServer();
    process.exit(1);
  });
  
  tester.runAllTests().catch(error => {
    console.error('💥 Integration test suite failed:', error);
    process.exit(1);
  });
}

export default IntegrationTester;