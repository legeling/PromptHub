"""Drive only a disposable Claude terminal; no credentials or approvals are seeded."""

import errno
import json
import os
import pty
import re
import select
import signal
import sys
import time

KEY_INTERVAL_SECONDS = 0.1
PROMPT_MOUNT_SECONDS = 0.5
PROCESS_EXIT_GRACE_SECONDS = 1


def main():
    timeout_seconds = float(sys.argv[1])
    expected_reply = sys.argv[2]
    output_limit = int(sys.argv[3])
    pid, terminal = pty.fork()
    if pid == 0:
        os.execvp(sys.argv[4], sys.argv[4:])
    captured = bytearray()
    sent = set()
    # These prompts approve only the empty fixture workspace and terminal theme.
    prompts = [
        ("Select with numbers [1-7]. Then Enter to submit:", b"2\r"),
        ("Press Enter to continue", b"\r"),
        ("Enter y/n:", b"y\r"),
        ("claude: " + expected_reply, b"\x04"),
        ("Press Ctrl-D again to exit", b"\x04"),
    ]
    deadline = time.monotonic() + timeout_seconds
    status = None
    failure = None
    try:
        while time.monotonic() < deadline:
            ready, _, _ = select.select([terminal], [], [], max(0, deadline - time.monotonic()))
            if not ready:
                failure = "Native terminal deadline exceeded"
                break
            try:
                chunk = os.read(terminal, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                break
            if not chunk:
                break
            captured.extend(chunk)
            if len(captured) > output_limit:
                failure = "Native terminal output exceeded fixture limit"
                break
            text = captured.decode("utf-8", errors="replace")
            text = re.sub(r"\x1b\][^\x07]*(?:\x07|\x1b\\)", "", text)
            text = re.sub(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|[()][A-Z0-9]|.)", "", text)
            for prompt, reply in prompts:
                if prompt in text and prompt not in sent:
                    sent.add(prompt)
                    # Claude renders trust text before mounting its input listener.
                    time.sleep(PROMPT_MOUNT_SECONDS)
                    # Interactive inputs update between key events; do not paste
                    # the value and confirmation into the same terminal event.
                    for key in reply:
                        os.write(terminal, bytes([key]))
                        time.sleep(KEY_INTERVAL_SECONDS)
        else:
            failure = "Native terminal deadline exceeded"
    finally:
        # forkpty owns a separate session; clean its entire process group even on failure.
        waited, status = os.waitpid(pid, os.WNOHANG)
        exit_deadline = time.monotonic() + PROCESS_EXIT_GRACE_SECONDS
        while not waited and time.monotonic() < exit_deadline:
            time.sleep(KEY_INTERVAL_SECONDS)
            waited, status = os.waitpid(pid, os.WNOHANG)
        if not waited:
            os.killpg(pid, signal.SIGKILL)
            _, status = os.waitpid(pid, 0)
        os.close(terminal)
    result = {
        "exitCode": os.waitstatus_to_exitcode(status),
        "completed": "claude: " + expected_reply in sent,
        "prompts": list(sent),
        "output": captured.decode("utf-8", errors="replace"),
        "failure": failure,
    }
    print(json.dumps(result))
    return 0 if result["completed"] and result["exitCode"] == 0 and not failure else 1


if __name__ == "__main__":
    sys.exit(main())
