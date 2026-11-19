# JanCare verification notes

Checks run while preparing this project archive:

- JavaScript syntax checks (`node --check`) passed for backend source, models, middleware, services, and staff setup script.
- Python syntax checks (`python -m py_compile`) passed for the ML service and training/data scripts.
- Model training completed successfully on the bundled synthetic dataset (50,000 rows; chronological 40,000/10,000 split).
- FastAPI smoke checks passed: `/health` reports the model loaded; a valid crowd prediction returns eight slots; malformed date is rejected; unknown department is rejected.
- Reported synthetic-data holdout metrics from the included training run: MAE 10.022, RMSE 12.362, R² 0.841, grouped baseline MAE 10.022. The model did not beat that grouped baseline in this run; do not present it as superior without further evaluation.

Not verified in this environment:

- The frontend production build and lint were not completed because the npm dependency installation did not finish in this execution environment (`vite` was unavailable after the install attempt).
- End-to-end API tests with a live MongoDB server were not run here.

Before your demonstration, install dependencies using the README, run `npm run build` in `frontend`, start MongoDB and all three services, and complete the walkthrough. A successful syntax check alone does not prove a whole-stack deployment is error-free.
