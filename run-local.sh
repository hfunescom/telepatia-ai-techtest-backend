#!/usr/bin/env bash
set -e
#Project build
cd functions
#Load env variables
export $(cat .env | xargs)
#Project build
npm run build
#Start firebase emulators
firebase emulators:start --only functions