"""In-memory user store for this demo.

A real implementation would replace USERS and get_user() with a
database-backed lookup (e.g. SQLAlchemy + Postgres) behind the same
get_user(username) -> dict | None interface.
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS = {
    "demo": {
        "username": "demo",
        "hashed_password": pwd_context.hash("demo123"),
    }
}


def get_user(username: str) -> dict | None:
    return USERS.get(username)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
