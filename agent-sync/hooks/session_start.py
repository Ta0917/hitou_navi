"""SessionStart hook: agent-syncの共有状態4ファイルを強制的にコンテキストへ注入する。

CLAUDE.md/AGENTS.mdの「セッション開始時に必ずagent-syncを読む」という指示文だけでは
LLMの指示追従に依存してしまうため、hooksで機械的に内容を読み込ませる。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

FILES = [
    "agent-sync/SESSION_STATE.md",
    "agent-sync/DECISIONS.md",
    "agent-sync/WORKLOG.md",
    "agent-sync/HANDOFF.md",
]


def read_file(rel_path: str) -> str:
    abs_path = os.path.join(ROOT, rel_path)
    if not os.path.exists(abs_path):
        return f"### {rel_path}\n\n(ファイルが見つかりません: {abs_path})"
    with open(abs_path, encoding="utf-8") as f:
        return f"### {rel_path}\n\n{f.read()}"


def main() -> None:
    sections = [read_file(rel) for rel in FILES]
    content = (
        "[agent-sync 自動読み込み — SessionStart hook]\n"
        "このプロジェクトはClaude CodeとCodexが共有state（agent-sync/）を使って同期している。"
        "以下がその現在の内容。作業を始める前に必ず目を通すこと。\n\n"
        + "\n\n---\n\n".join(sections)
    )
    output = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": content,
        }
    }
    # ensure_ascii=True（既定）にする：Windowsのコンソールは既定でcp932等になっており、
    # 日本語を含む文字列をそのまま標準出力するとUnicodeEncodeErrorになるため、
    # \uXXXXエスケープのみのASCII出力にして安全に受け渡す（JSON側で正しく復元される）。
    print(json.dumps(output))


if __name__ == "__main__":
    main()
