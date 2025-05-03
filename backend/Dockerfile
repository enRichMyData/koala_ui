# backend/Dockerfile
ARG PYTHON_VERSION
FROM python:${PYTHON_VERSION}

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000", "--reload"]
