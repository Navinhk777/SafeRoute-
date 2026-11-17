
import json
import os
from io import BytesIO

from dotenv import load_dotenv
from google import genai
from PIL import Image

load_dotenv()

MODEL_NAME = "gemini-3.5-flash-lite"


def assess_dark_spot(image_bytes: bytes) -> dict:
    """
    Assess visible lighting conditions in a street photograph.
    This does NOT determine whether a location is actually safe.
    """

    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise ValueError("GEMINI_API_KEY is missing from backend/.env")

    image = Image.open(BytesIO(image_bytes)).convert("RGB")

    client = genai.Client(api_key=api_key)

    prompt = """
    Analyse this street photograph for visible lighting conditions.

    Return ONLY valid JSON with these fields:
    {
      "lighting_level": "good, moderate, poor, or very_poor",
      "dark_areas_visible": true,
      "street_visibility": "good, moderate, or poor",
      "visible_lights": "description of visible street lights",
      "obstructions": "description of visible obstructions, if any",
      "image_quality": "clear, blurry, or too_dark",
      "recommendation": "brief practical observation"
    }

    Rules:
    - Assess only what is visible in the photograph.
    - Do not guess crime levels or human intentions.
    - Do not claim that a location is safe or unsafe.
    - If the image is unclear, say so.
    """

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[prompt, image]
    )

    text = response.text.strip()

    # Remove optional Markdown code fences
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0].strip()

    result = json.loads(text)

    return {
        "assessment": result,
        "disclaimer": (
            "AI observations are based only on visible image details. "
            "They are not a guarantee of personal safety."
        )
    }
