#!/bin/bash
set -e

echo "======================"
echo "DEPLOY BACKEND"
echo "======================"

cd /root/green-web/backend
bash deploy-backend.sh


echo "======================"
echo "DEPLOY FRONTEND"
echo "======================"

cd /root/green-web/frontend
bash deploy-frontend.sh


echo "======================"
echo "DEPLOY ADMINISTRATOR"
echo "======================"

cd /root/green-web/administrator
bash deploy-admin.sh


echo "======================"
echo "ALL DEPLOY SUCCESS"
echo "======================"