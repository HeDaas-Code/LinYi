#!/usr/bin/env bash
# 运行林逸小说家大脑 Agent（真实 LLM 模式）
set -e

cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
    echo "创建虚拟环境..."
    python3 -m venv .venv
fi

source .venv/bin/activate

if ! python -c "import fastapi, uvicorn, openai" 2>/dev/null; then
    echo "安装依赖..."
    pip install -r requirements.txt
fi

# 从 API.info 读取密钥（如存在）
if [[ -f API.info ]]; then
    export OPENAI_API_KEY="$(python3 -c "import json; print(json.load(open('API.info'))['key'])")"
fi

exec python main.py \
    --llm-model "MiniMax-M3" \
    --config novelist.config.json \
    "$@"
