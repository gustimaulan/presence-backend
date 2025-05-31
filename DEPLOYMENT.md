# Deployment Guide for Presence Data Backend API

This guide provides step-by-step instructions for deploying the Presence Data Backend API to a production environment.

## 📋 Prerequisites

### Server Requirements
- **OS**: Ubuntu 20.04 LTS or higher (recommended)
- **RAM**: Minimum 1GB (2GB+ recommended)
- **Storage**: Minimum 10GB available space
- **Network**: Public IP address and domain name
- **Node.js**: Version 18.0.0 or higher
- **Package Manager**: npm or yarn

### External Services
- **Google Cloud Project** with Sheets API enabled
- **Google API Key** with appropriate permissions
- **Domain Name** (optional but recommended)
- **SSL Certificate** (Let's Encrypt recommended)

## 🔧 Server Setup

### 1. Initial Server Configuration

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git unzip software-properties-common

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Create Application User

```bash
# Create dedicated user for the application
sudo adduser --system --group --home /var/www/presence-api presence-api

# Create application directory
sudo mkdir -p /var/www/presence-api
sudo chown presence-api:presence-api /var/www/presence-api
```

## 📁 Application Deployment

### 1. Deploy Application Code

```bash
# Switch to application user
sudo su - presence-api

# Clone repository (replace with your repo URL)
cd /var/www/presence-api
git clone https://github.com/yourusername/presence-backend.git .

# Or upload files manually
# scp -r ./backend/* user@server:/var/www/presence-api/

# Install dependencies
npm ci --only=production

# Set proper permissions
sudo chown -R presence-api:presence-api /var/www/presence-api
sudo chmod -R 755 /var/www/presence-api
```

### 2. Environment Configuration

```bash
# Create production environment file
sudo nano /var/www/presence-api/.env
```

**Production `.env` configuration:**

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Google Sheets API Configuration
GOOGLE_SHEET_ID=your_production_google_sheet_id
GOOGLE_API_KEY=your_production_google_api_key
GOOGLE_SHEET_RANGE=Sheet1!A:E

# Cache Configuration
CACHE_DURATION=300000

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Security (optional)
SESSION_SECRET=your_secure_random_session_secret

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/presence-api/app.log
```

```bash
# Secure environment file
sudo chmod 600 /var/www/presence-api/.env
sudo chown presence-api:presence-api /var/www/presence-api/.env
```

## 🔄 Process Management with PM2

### 1. Install PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create PM2 configuration
sudo nano /var/www/presence-api/ecosystem.config.js
```

**PM2 Configuration (`ecosystem.config.js`):**

```javascript
module.exports = {
  apps: [{
    name: 'presence-api',
    script: 'server.js',
    cwd: '/var/www/presence-api',
    user: 'presence-api',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/presence-api/error.log',
    out_file: '/var/log/presence-api/access.log',
    log_file: '/var/log/presence-api/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    restart_delay: 1000,
    max_restarts: 5,
    min_uptime: '10s'
  }]
};
```

### 2. Setup Logging Directory

```bash
# Create log directory
sudo mkdir -p /var/log/presence-api
sudo chown presence-api:presence-api /var/log/presence-api
sudo chmod 755 /var/log/presence-api
```

### 3. Start Application with PM2

```bash
# Start application
sudo -u presence-api pm2 start ecosystem.config.js

# Save PM2 configuration
sudo -u presence-api pm2 save

# Setup PM2 startup script
sudo pm2 startup systemd -u presence-api --hp /var/www/presence-api

# Enable and start PM2
sudo systemctl enable pm2-presence-api
sudo systemctl start pm2-presence-api
```

## 🌐 Reverse Proxy with Nginx

### 1. Install and Configure Nginx

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/presence-api
```

**Nginx Configuration:**

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Rate limiting
    limit_req zone=api burst=20 nodelay;

    # Proxy settings
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Health check endpoint (no rate limiting)
    location /health {
        proxy_pass http://localhost:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files (if any)
    location /static/ {
        alias /var/www/presence-api/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Log files
    access_log /var/log/nginx/presence-api.access.log;
    error_log /var/log/nginx/presence-api.error.log;
}
```

### 2. Enable Nginx Configuration

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/presence-api /etc/nginx/sites-enabled/

# Remove default configuration
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## 🔒 SSL/TLS Configuration with Let's Encrypt

### 1. Install Certbot

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 2. Auto-renewal Setup

```bash
# Test renewal
sudo certbot renew --dry-run

# Setup automatic renewal (already configured by default)
sudo systemctl status certbot.timer
```

## 🔥 Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow essential services
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'

# Deny direct access to Node.js port
sudo ufw deny 3000

# Check status
sudo ufw status verbose
```

## 📊 Monitoring and Logging

### 1. Log Rotation

```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/presence-api
```

**Logrotate Configuration:**

```
/var/log/presence-api/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 0644 presence-api presence-api
    postrotate
        sudo -u presence-api pm2 reloadLogs
    endscript
}

/var/log/nginx/presence-api.*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
    postrotate
        systemctl reload nginx
    endscript
}
```

### 2. System Monitoring

```bash
# Install monitoring tools
sudo apt install -y htop iotop nethogs

# Monitor PM2 processes
sudo -u presence-api pm2 monit

# Check application logs
sudo -u presence-api pm2 logs presence-api

# Check Nginx logs
sudo tail -f /var/log/nginx/presence-api.access.log
sudo tail -f /var/log/nginx/presence-api.error.log
```

### 3. Health Check Script

```bash
# Create health check script
sudo nano /usr/local/bin/presence-api-health.sh
```

**Health Check Script:**

```bash
#!/bin/bash

API_URL="http://localhost:3000/health"
LOG_FILE="/var/log/presence-api/health-check.log"

# Make health check request
RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "$API_URL")

if [ "$RESPONSE" -eq 200 ]; then
    echo "$(date): API is healthy" >> "$LOG_FILE"
else
    echo "$(date): API health check failed (HTTP $RESPONSE)" >> "$LOG_FILE"
    # Restart application if unhealthy
    sudo -u presence-api pm2 restart presence-api
    echo "$(date): Application restarted" >> "$LOG_FILE"
fi
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/presence-api-health.sh

# Add to crontab for monitoring every 5 minutes
echo "*/5 * * * * /usr/local/bin/presence-api-health.sh" | sudo crontab -
```

## 🛡️ Security Hardening

### 1. System Security

```bash
# Update system regularly
sudo apt update && sudo apt upgrade -y

# Configure automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Install fail2ban for intrusion prevention
sudo apt install -y fail2ban

# Configure fail2ban for Nginx
sudo nano /etc/fail2ban/jail.local
```

**Fail2ban Configuration:**

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=ReqLimit, port="http,https", protocol=tcp]
logpath = /var/log/nginx/*error.log
findtime = 600
bantime = 7200
maxretry = 10
```

### 2. Application Security

```bash
# Secure file permissions
sudo find /var/www/presence-api -type f -exec chmod 644 {} \;
sudo find /var/www/presence-api -type d -exec chmod 755 {} \;
sudo chmod 600 /var/www/presence-api/.env
sudo chmod +x /var/www/presence-api/server.js
```

## 💾 Backup and Maintenance

### 1. Backup Script

```bash
# Create backup script
sudo nano /usr/local/bin/presence-api-backup.sh
```

**Backup Script:**

```bash
#!/bin/bash

BACKUP_DIR="/var/backups/presence-api"
APP_DIR="/var/www/presence-api"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup application files
tar -czf "$BACKUP_DIR/app_$DATE.tar.gz" -C "$APP_DIR" .

# Backup PM2 configuration
sudo -u presence-api pm2 save
cp /var/www/presence-api/.pm2/dump.pm2 "$BACKUP_DIR/pm2_$DATE.json"

# Backup logs
tar -czf "$BACKUP_DIR/logs_$DATE.tar.gz" /var/log/presence-api/

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.json" -mtime +30 -delete

echo "$(date): Backup completed successfully" >> /var/log/presence-api/backup.log
```

```bash
# Make executable and schedule
sudo chmod +x /usr/local/bin/presence-api-backup.sh

# Add to crontab for daily backups at 2 AM
echo "0 2 * * * /usr/local/bin/presence-api-backup.sh" | sudo crontab -
```

### 2. Update Process

```bash
# Create update script
sudo nano /usr/local/bin/presence-api-update.sh
```

**Update Script:**

```bash
#!/bin/bash

APP_DIR="/var/www/presence-api"
BACKUP_DIR="/var/backups/presence-api"

echo "Starting application update..."

# Backup current version
cd "$APP_DIR"
sudo -u presence-api pm2 save
tar -czf "$BACKUP_DIR/pre-update-$(date +%Y%m%d_%H%M%S).tar.gz" .

# Pull latest changes
sudo -u presence-api git pull origin main

# Install/update dependencies
sudo -u presence-api npm ci --only=production

# Restart application
sudo -u presence-api pm2 restart presence-api

# Wait for startup
sleep 10

# Health check
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "Update completed successfully"
    sudo -u presence-api pm2 save
else
    echo "Update failed, rolling back..."
    # Rollback process would go here
    exit 1
fi
```

## 🚀 Performance Optimization

### 1. System Optimizations

```bash
# Optimize system limits
sudo nano /etc/security/limits.conf
```

Add these lines:
```
presence-api soft nofile 65536
presence-api hard nofile 65536
presence-api soft nproc 32768
presence-api hard nproc 32768
```

### 2. Node.js Optimizations

Update your PM2 configuration:

```javascript
// In ecosystem.config.js
node_args: [
  '--max-old-space-size=1024',
  '--optimize-for-size'
]
```

## 📋 Deployment Checklist

- [ ] Server provisioned and updated
- [ ] Node.js 18+ installed
- [ ] Application user created
- [ ] Application code deployed
- [ ] Environment variables configured
- [ ] PM2 installed and configured
- [ ] Application started with PM2
- [ ] Nginx installed and configured
- [ ] SSL certificate obtained and configured
- [ ] Firewall configured
- [ ] Monitoring and logging setup
- [ ] Health checks configured
- [ ] Backup system implemented
- [ ] Security hardening applied
- [ ] Performance optimization completed

## 🆘 Troubleshooting

### Common Issues

1. **Application won't start:**
   ```bash
   # Check PM2 logs
   sudo -u presence-api pm2 logs presence-api
   
   # Check environment variables
   sudo -u presence-api cat /var/www/presence-api/.env
   ```

2. **502 Bad Gateway:**
   ```bash
   # Check if application is running
   sudo -u presence-api pm2 list
   
   # Check Nginx configuration
   sudo nginx -t
   ```

3. **Google Sheets API errors:**
   ```bash
   # Verify API key and sheet ID
   curl "https://sheets.googleapis.com/v4/spreadsheets/YOUR_SHEET_ID/values/Sheet1!A1:E1?key=YOUR_API_KEY"
   ```

### Recovery Commands

```bash
# Restart everything
sudo systemctl restart nginx
sudo -u presence-api pm2 restart all

# Check all services
sudo systemctl status nginx
sudo -u presence-api pm2 status

# View real-time logs
sudo tail -f /var/log/nginx/presence-api.error.log
sudo -u presence-api pm2 logs presence-api --lines 50
```

## 📞 Support and Maintenance

- **Monitor**: Check `/api/status` endpoint regularly
- **Logs**: Review application and Nginx logs daily
- **Updates**: Update dependencies monthly
- **Backups**: Verify backup integrity weekly
- **Security**: Apply security updates immediately
- **Performance**: Monitor resource usage and scale as needed

---

**Next Steps:** After deployment, test all endpoints and configure your frontend to use the production API URL. 