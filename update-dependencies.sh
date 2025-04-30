#!/bin/bash

# Stop the running containers
docker-compose down

# Remove the node_modules volume if it exists
if docker volume ls | grep -q "koala_ui_frontend_node_modules"; then
  docker volume rm koala_ui_frontend_node_modules
fi

# Rebuild and start the containers
docker-compose up --build
