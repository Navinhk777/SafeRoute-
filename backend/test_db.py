import os

os.environ["SQLALCHEMY_CEXT"] = "0"

from app.database import engine

try:
    with engine.connect() as connection:
        print("Supabase database connected successfully!")

except Exception as error:
    print("Database connection failed.")
    print(type(error).__name__, error)