#!/usr/bin/env bash
set -e
#Project build
cd functions
#Clean build
rm -rf lib
#Load env variables
export $(cat .env | xargs)
#Project build
npm run build
#Start firebase emulators
firebase emulators:start --only functions