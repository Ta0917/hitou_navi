"""SessionEnd hook: git状態の機械的な差分サマリをWORKLOG.mdに自動追記する。

LLMを介さない完全機械的な記録。「何が変わったか」の生データを残すことが目的で、
「なぜ変えたか」の判断を伴う要約は引き続きエージェント自身がセッション終了時に書く。
"""
import datetime
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def run(cmd: list[str]) -> str:
    try:
        result = subprocess.run(
            cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        return result.stdout.strip()
    except Exception as e:  # noqa: BLE001 - hookは失敗しても握りつぶして良い
        return f"(コマンド実行エラー: {e})"


def main() -> None:
    status = run(["git", "status", "--short"])
    diffstat = run(["git", "diff", "--stat"])
    staged_diffstat = run(["git", "diff", "--stat", "--cached"])
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    block = f"""
## {ts} - [自動記録: SessionEnd hook]

このエントリはgit状態の機械的なスナップショットです（LLMの要約ではありません）。

git status --short:
```
{status or "(変更なし)"}
```

git diff --stat（未ステージ）:
```
{diffstat or "(差分なし)"}
```

git diff --stat --cached（ステージ済み）:
```
{staged_diffstat or "(差分なし)"}
```
"""

    worklog_path = os.path.join(ROOT, "agent-sync", "WORKLOG.md")
    try:
        with open(worklog_path, "a", encoding="utf-8") as f:
            f.write(block)
    except Exception:  # noqa: BLE001 - hookは失敗してもセッション終了をブロックしない
        pass


if __name__ == "__main__":
    main()
