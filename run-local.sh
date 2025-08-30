#!/usr/bin/env bash
set -e
#Project build
cd functions
#Project build
npm run build
#Start firebase emulators
firebase emulators:start --only functions