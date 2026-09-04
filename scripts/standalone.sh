#!/bin/sh
# Runs the production build exactly the way the container does.
#
#   npm run build && npm run start:standalone
#
# `next build` with output: "standalone" deliberately leaves static assets and
# public/ outside the standalone tree, and the server resolves them relative to
# its own directory — so they are copied in and the server is started from
# there, which is what the Dockerfile does too.
set -e

rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
if [ -d public ]; then cp -r public .next/standalone/public; fi

cd .next/standalone
exec node server.js
