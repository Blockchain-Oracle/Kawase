#!/bin/sh
# Restart the spike server (its test hooks hold state in memory) and run the headless test.
cd "$(dirname "$0")"
# First run: docker exec deploy-postgres-1 psql -U kawase -d kawase -c "create database kawase_spike10" && npx drizzle-kit push --force
lsof -ti tcp:3010 | xargs kill 2>/dev/null; sleep 1
docker exec deploy-postgres-1 psql -q -U kawase -d kawase_spike10 -c 'truncate "user" cascade; truncate verification' >/dev/null
node server.ts > server.log 2>&1 &
sleep 2
node test-node.ts | tee test.log
