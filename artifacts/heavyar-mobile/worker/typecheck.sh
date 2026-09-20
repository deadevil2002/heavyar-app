#!/bin/sh
set -eu

worker_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$worker_dir/../../.." && pwd)

"$repo_dir/node_modules/.bin/tsc" --project "$worker_dir/tsconfig.json" --pretty false