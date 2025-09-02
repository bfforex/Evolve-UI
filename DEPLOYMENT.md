# Evolve-UI Deployment Guide

## Local Development Deployment

### Prerequisites
- Node.js 18+ 
- Ollama installed and running
- SearXNG (optional)

### Quick Start
```bash
git clone https://github.com/bfforex/Evolve-UI.git
cd Evolve-UI
npm install
cp .env.example .env
# Edit .env with your configuration
npm start
```

## Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Create data directory
RUN mkdir -p data/sessions data/uploads

EXPOSE 8787

CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  evolve-ui:
    build: .
    ports:
      - "8787:8787"
    environment:
      - OLLAMA_URL=http://ollama:11434
      - SEARXNG_URL=http://searxng:8080
      - DEBUG=false
    volumes:
      - ./data:/app/data
    depends_on:
      - ollama
      - searxng

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

  searxng:
    image: searxng/searxng:latest
    ports:
      - "8080:8080"
    environment:
      - SEARXNG_SECRET=your-secret-key

volumes:
  ollama_data:
```

## Production Deployment

### Environment Variables
```bash
# Production environment
NODE_ENV=production
DEBUG=false

# Server configuration
PORT=8787
HOST=0.0.0.0

# External services
OLLAMA_URL=https://your-ollama-instance.com
SEARXNG_URL=https://your-searxng-instance.com

# Security
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
UPLOAD_LIMIT_MB=50

# Performance
MAX_CONCURRENT_REQUESTS=200
REQUEST_TIMEOUT_MS=60000
```

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Handle Server-Sent Events
    location /api/chat {
        proxy_pass http://localhost:8787;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }
}
```

### SSL with Let's Encrypt
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### PM2 Process Manager
```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
```

### ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: 'evolve-ui',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8787
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup
```

## Cloud Deployments

### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

### Heroku
```bash
# Install Heroku CLI
# Create Procfile
echo "web: npm start" > Procfile

# Deploy
heroku create your-app-name
git push heroku main
```

### DigitalOcean App Platform
```yaml
name: evolve-ui
services:
- name: web
  source_dir: /
  github:
    repo: your-username/Evolve-UI
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: NODE_ENV
    value: production
  - key: OLLAMA_URL
    value: https://your-ollama-service.com
```

## Monitoring and Logging

### Health Checks
```bash
# Basic health check
curl http://localhost:8787/api/health

# Detailed monitoring script
#!/bin/bash
while true; do
  if curl -f http://localhost:8787/api/health > /dev/null 2>&1; then
    echo "$(date): Service is healthy"
  else
    echo "$(date): Service is down, restarting..."
    pm2 restart evolve-ui
  fi
  sleep 60
done
```

### Log Management
```bash
# Rotate logs with logrotate
sudo nano /etc/logrotate.d/evolve-ui

# Content:
/path/to/evolve-ui/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Security Considerations

### Firewall Rules
```bash
# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw deny 8787   # Block direct access to app
sudo ufw enable
```

### Environment Security
- Use environment variables for secrets
- Never commit .env files
- Use strong random keys
- Regular security updates
- Monitor access logs

### Rate Limiting
- Configure appropriate rate limits
- Use CDN for static assets
- Implement IP-based restrictions
- Monitor for abuse patterns

## Backup Strategy

### Data Backup
```bash
#!/bin/bash
# Backup script
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf "backup_evolve_ui_$DATE.tar.gz" data/
aws s3 cp "backup_evolve_ui_$DATE.tar.gz" s3://your-backup-bucket/
```

### Database Migration
```bash
# Export sessions
cp -r data/sessions/ backup_sessions_$(date +%Y%m%d)/

# Export memory
cp data/memory.json backup_memory_$(date +%Y%m%d).json
```

## Performance Optimization

### Caching
- Use Redis for session storage
- Implement response caching
- Enable gzip compression
- Use CDN for static assets

### Scaling
- Use load balancer
- Implement horizontal scaling
- Optimize database queries
- Monitor resource usage

## Maintenance

### Regular Tasks
- Update dependencies monthly
- Monitor disk space
- Rotate logs
- Backup data
- Update SSL certificates
- Security patches

### Monitoring Commands
```bash
# System resources
htop
df -h
free -m

# Application logs
pm2 logs evolve-ui
tail -f logs/combined.log

# Performance
pm2 monit
```