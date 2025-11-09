#!/bin/bash

# Raven - Fast Startup Script
# Skips comprehensive health checks for faster development startup
# Use this for local development when you want quick iterations
# For production deployment, use ./start.sh instead

export SKIP_HEALTH_CHECKS=1

./start.sh
