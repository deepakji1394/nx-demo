from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_login_success_returns_access_token():
    response = client.post(
        "/auth/login", json={"username": "demo", "password": "demo123"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password_returns_401():
    response = client.post(
        "/auth/login", json={"username": "demo", "password": "wrong"}
    )
    assert response.status_code == 401


def test_login_unknown_user_returns_401():
    response = client.post(
        "/auth/login", json={"username": "nobody", "password": "demo123"}
    )
    assert response.status_code == 401


def test_me_requires_valid_token():
    response = client.get("/me")
    assert response.status_code in (401, 403)


def test_me_returns_username_for_valid_token():
    login = client.post(
        "/auth/login", json={"username": "demo", "password": "demo123"}
    )
    token = login.json()["access_token"]
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"username": "demo"}
