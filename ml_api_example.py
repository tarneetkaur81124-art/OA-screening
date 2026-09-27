# Example only — hand this to your ML teammates as a starting shape.
# They plug their already-trained model into the two functions marked below.
# Run with: uvicorn ml_api_example:app --reload --port 8000

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow the Vite dev server (and later your deployed frontend URL) to call this.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your real frontend URL before deploying
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/analyze-gait")
async def analyze_gait(video: UploadFile):
    video_bytes = await video.read()

    # TODO (ML team): run your pose-estimation model on video_bytes here.
    # result = your_gait_model.predict(video_bytes)
    result = {
        "kneeFlexionDeg": 108,
        "strideAsymmetry": 0.14,
        "cadence": 96,
        "riskContribution": "mid"
    }
    return result


@app.post("/analyze-xray")
async def analyze_xray(image: UploadFile):
    image_bytes = await image.read()

    # TODO (ML team): run your X-ray classification model on image_bytes here.
    # result = your_xray_model.predict(image_bytes)
    result = {
        "klGrade": 2,              # Kellgren-Lawrence grade, or whatever scale your model uses
        "findings": "Mild joint space narrowing",
        "riskContribution": "mid"
    }
    return result
