from fastapi import FastAPI

app = FastAPI(
    title="SafeRoute API",
    description="Backend API for the SafeRoute application",
    version="1.0.0"
)

@app.get("/")
def home():
    return {"message": "Welcome to SafeRoute API"}

@app.get("/health")
def health_check():
    return {"status": "Backend is running"}
