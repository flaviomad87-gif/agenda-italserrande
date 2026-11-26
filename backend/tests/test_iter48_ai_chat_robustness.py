# Iter48 robustness: saved chat history with empty assistant content / empty text block -> does next message fail with 400?
import uuid, requests, pytest
from test_iter48_ai_assistente import U, mdb


@pytest.fixture(scope="module")
def A():
    x = U("r"); yield x; x.close()


def _seed(A, assistant_content):
    cid = uuid.uuid4().hex
    mdb.ai_chats.insert_one({"id": cid, "uid": A.uid, "model": "haiku", "titolo": "TEST_", "costo": 0, "pending": None,
                             "created_at": "2026-11-26T00:00:00", "updated_at": "2026-11-26T00:00:00",
                             "messages": [{"role": "user", "content": "ciao"}, {"role": "assistant", "content": assistant_content}]})
    return cid


@pytest.mark.parametrize("content", [[], [{"type": "text", "text": ""}],
                                     [{"type": "text", "text": "Ciao!", "citations": None, "extra": 1}]],
                         ids=["empty_list", "empty_text", "legacy_extra_fields"])
def test_followup_after_odd_history(A, content):
    cid = _seed(A, content)
    r = A.req("POST", "/assistente/chat", json={"id": cid, "model": "haiku", "testo": "Rispondi solo: ok"})
    print(r.status_code, r.text[:200])
    assert r.status_code == 200, r.text


TU = {"type": "tool_use", "id": "toolu_test123", "name": "agenda", "input": {}}
TR = {"type": "tool_result", "tool_use_id": "toolu_test123", "content": [{"type": "text", "text": "{\"oggi\": \"2026-11-26\"}"}], "is_error": False}


@pytest.mark.parametrize("tail", [
    [{"role": "assistant", "content": [TU]}, {"role": "user", "content": [TR]}],   # error after conferma: tool_result is last
    [{"role": "assistant", "content": [TU]}],                                      # stop_reason=max_tokens with tool_use, no result
], ids=["consecutive_user_after_tool_result", "orphan_tool_use"])
def test_followup_after_interrupted_tools(A, tail):
    cid = uuid.uuid4().hex
    mdb.ai_chats.insert_one({"id": cid, "uid": A.uid, "model": "haiku", "titolo": "TEST_", "costo": 0, "pending": None,
                             "created_at": "2026-11-26T00:00:00", "updated_at": "2026-11-26T00:00:00",
                             "messages": [{"role": "user", "content": "che giorno è?"}] + tail})
    r = A.req("POST", "/assistente/chat", json={"id": cid, "model": "haiku", "testo": "Rispondi solo: ok"})
    print(r.status_code, r.text[:150])
    assert r.status_code == 200, r.status_code
