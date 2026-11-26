# Iter45: concurrency probes - quote numbering and documenti numbering under parallel creates
import uuid, requests, pytest
from concurrent.futures import ThreadPoolExecutor
from tests.test_iter45_full_regression import U, BASE


@pytest.fixture(scope="module")
def C():
    x = U("c"); yield x; x.close()


def test_quote_numbers_unique_under_concurrency(C):
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda i: C.req("POST", "/quotes", json={"clientName": f"TEST_cc{i}"}).json()["number"], range(8)))
    assert len(set(res)) == 8, f"duplicate quote numbers: {sorted(res)}"


def test_documenti_numbers_unique_under_concurrency(C):
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda i: C.req("POST", "/documenti", json={"kind": "verifica", "data": "2027-02-01"}).json()["numero"], range(8)))
    assert sorted(res) == list(range(1, 9)), res
