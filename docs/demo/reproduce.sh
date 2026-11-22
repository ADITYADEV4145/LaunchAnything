#!/usr/bin/env bash
set -euo pipefail

test -f package.json
command -v jq >/dev/null || { printf 'jq is required. Install jq before reproducing.\n' >&2; exit 1; }
if test -e .launch; then
  printf 'Use a fresh disposable checkout: .launch already exists.\n' >&2
  exit 1
fi
npm ci
npm run build
node dist/cli.js doctor --json
mkdir -p .launch/posts .launch/video
cp docs/demo/inputs/config.json .launch/config.json
cp docs/demo/inputs/product.json .launch/product.json
cp docs/demo/inputs/published.json .launch/published.json
node dist/cli.js init --profile devtool --yes --json
node dist/cli.js scan --json
node dist/cli.js validate product --json
node dist/cli.js plan --history .launch/history.json --json
node dist/cli.js brief --json
cp docs/demo/inputs/brief.md .launch/brief.md
node dist/cli.js validate brief --json
node dist/cli.js brief --json
node dist/cli.js write --channel x --json
cp docs/demo/inputs/x.md .launch/posts/x.md
node dist/cli.js check --channel x --json
node dist/cli.js warroom --json
node dist/cli.js review --json
cp docs/demo/inputs/script.json .launch/video/script.json
cp docs/demo/inputs/shots-bootstrap.yaml .launch/shots.yaml
python3 -m http.server 3037 --bind 127.0.0.1 --directory .launch > .launch/demo-server.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
node dist/cli.js shots --json
node dist/cli.js video script --json
node dist/cli.js video --renderer ffmpeg --format 16x9 --json
cp .launch/media/shots/render.png .launch/media/render.png
cp docs/demo/inputs/shots.yaml .launch/shots.yaml
node dist/cli.js shots --json
rm .launch/media/render.png
node dist/cli.js video --renderer ffmpeg --format 16x9,9x16,1x1 --json
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate:format=duration,size -of json .launch/video/demo-16x9.mp4
ffmpeg -y -v error -ss 55 -i .launch/video/demo-16x9.mp4 -frames:v 1 .launch/video/poster.png
