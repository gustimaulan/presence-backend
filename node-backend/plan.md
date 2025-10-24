# Background Sync Implementation Plan

## Overview
Implementasi background sync untuk mensinkronkan data dari Google Sheets ke database lokal guna meningkatkan performance API response time dari 100-500ms menjadi 1-10ms.

## Current Architecture
```
Frontend → API → Google Sheets API → Response (100-500ms)
```

## Target Architecture
```
Google Sheets → Background Sync → Local Database
Frontend → API → Local Database → Response (1-10ms)
```

## Phase 1: Preparation & Setup (Week 1)

### 1.1 Database Setup
- [ ] Pilih database (PostgreSQL recommended untuk production)
- [ ] Design schema untuk presence data
- [ ] Setup database connection di aplikasi
- [ ] Create migration scripts

### 1.2 Environment Configuration
- [ ] Add database credentials ke .env
- [ ] Install required dependencies (pg/mongoose, node-cron)
- [ ] Setup database connection pooling

### 1.3 Schema Design
```sql
-- Primary table untuk presence data
CREATE TABLE presence_data (
    id SERIAL PRIMARY KEY,
    google_row_id VARCHAR(50) UNIQUE,
    teacher_name VARCHAR(255) NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    lesson_date DATE NOT NULL,
    lesson_time TIME NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20) DEFAULT 'synced',
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sync metadata table
CREATE TABLE sync_metadata (
    id SERIAL PRIMARY KEY,
    last_sync_timestamp TIMESTAMP WITH TIME ZONE,
    total_records_synced INTEGER DEFAULT 0,
    sync_status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Phase 2: Background Service Implementation (Week 2)

### 2.1 Sync Service Core
- [ ] Buat `src/services/syncService.js`
- [ ] Implement initial full sync function
- [ ] Implement incremental sync function
- [ ] Add error handling dan retry logic

### 2.2 Database Operations
- [ ] Buat `src/models/presenceModel.js`
- [ ] Implement CRUD operations
- [ ] Add bulk insert/update functions
- [ ] Implement upsert logic untuk handle duplicates

### 2.3 Scheduler Implementation
- [ ] Buat `src/services/schedulerService.js`
- [ ] Implement cron job untuk incremental sync (setiap 5 menit)
- [ ] Implement cron job untuk full validation (setiap jam)
- [ ] Add graceful shutdown handling

## Phase 3: API Layer Modification (Week 3)

### 3.1 New Data Source
- [ ] Modify `src/services/dataService.js` untuk read dari database
- [ ] Keep Google Sheets service sebagai fallback
- [ ] Implement data source selection logic

### 3.2 Cache Strategy Update
- [ ] Reduce cache TTL (dari 5 menit ke 30 detik)
- [ ] Implement cache invalidation saat sync
- [ ] Add cache warming strategy

### 3.3 Endpoint Updates
- [ ] Update `/api/data` untuk read dari database
- [ ] Update `/api/data/query` untuk read dari database
- [ ] Add `/api/sync/status` endpoint
- [ ] Add `/api/sync/trigger` endpoint untuk manual sync

## Phase 4: Monitoring & Error Handling (Week 4)

### 4.1 Logging
- [ ] Implement structured logging untuk sync operations
- [ ] Add performance metrics logging
- [ ] Create log rotation setup

### 4.2 Monitoring Dashboard
- [ ] Buat `/api/sync/metrics` endpoint
- [ ] Track sync success rate
- [ ] Monitor sync duration
- [ ] Alert mechanism untuk failed sync

### 4.3 Error Recovery
- [ ] Implement exponential backoff retry
- [ ] Add circuit breaker pattern
- [ ] Create manual recovery procedures

## Phase 5: Testing & Deployment (Week 5)

### 5.1 Testing
- [ ] Unit tests untuk sync service
- [ ] Integration tests untuk database operations
- [ ] Load testing untuk API performance
- [ ] Failure scenario testing

### 5.2 Deployment Strategy
- [ ] Blue-green deployment setup
- [ ] Database migration scripts
- [ ] Rollback procedures
- [ ] Production monitoring setup

### 5.3 Performance Validation
- [ ] Benchmark API response time
- [ ] Validate data consistency
- [ ] Monitor resource usage
- [ ] Document performance improvements

## Implementation Details

### Sync Algorithm

1. **Initial Full Sync:**
   - Pull semua data dari Google Sheets
   - Transform dan insert ke database
   - Update sync metadata

2. **Incremental Sync (setiap 5 menit):**
   - Get last sync timestamp
   - Pull data dengan timestamp > last_sync
   - Compare dengan database (hash comparison)
   - Update records yang berubah
   - Insert new records
   - Soft delete records yang tidak ada

3. **Conflict Resolution:**
   - Google Sheets sebagai single source of truth
   - Last write wins strategy
   - Audit trail untuk semua changes

### Database Indexing Strategy
```sql
-- Index untuk query performance
CREATE INDEX idx_presence_teacher ON presence_data(teacher_name);
CREATE INDEX idx_presence_student ON presence_data(student_name);
CREATE INDEX idx_presence_date ON presence_data(lesson_date);
CREATE INDEX idx_presence_timestamp ON presence_data(timestamp);
CREATE INDEX idx_presence_sync_status ON presence_data(sync_status);
CREATE INDEX idx_presence_google_row_id ON presence_data(google_row_id);
```

### Error Handling Strategy
- **Network Issues:** Retry dengan exponential backoff
- **API Rate Limits:** Queue requests dan delay
- **Database Errors:** Log dan alert
- **Data Corruption:** Fallback ke Google Sheets API

### Monitoring Metrics
- Sync success rate (%)
- Average sync duration
- Records synced per cycle
- API response time (before/after)
- Database query performance
- Error rate dan types

## Risk Mitigation

### Technical Risks
- **Data Inconsistency:** Implement validation checks
- **Performance Degradation:** Monitor query performance
- **Sync Failures:** Implement retry logic dan alerts
- **Database Corruption:** Regular backups

### Business Risks
- **Downtime:** Blue-green deployment
- **Data Loss:** Multiple backup strategies
- **Performance Issues:** Gradual rollout dengan monitoring

## Success Criteria

### Performance Targets
- API response time < 10ms (dari 100-500ms)
- Sync completion time < 2 menit
- 99.9% sync success rate
- Zero data loss during sync

### Operational Targets
- Automated monitoring dan alerting
- Manual override capabilities
- Complete audit trail
- Documentation dan runbooks

## Timeline Summary
- **Week 1:** Database setup dan configuration
- **Week 2:** Background service implementation
- **Week 3:** API layer modification
- **Week 4:** Monitoring dan error handling
- **Week 5:** Testing dan deployment

## Resources Needed
- Database server (PostgreSQL)
- Additional storage untuk backup
- Monitoring tools (Prometheus/Grafana)
- Development time: 5 weeks
- Testing environment

## Next Steps
1. Approve implementation plan
2. Setup development environment
3. Begin Phase 1 implementation
4. Weekly progress reviews
5. Performance validation

---

*Last Updated: 23 October 2025*
*Version: 1.0*