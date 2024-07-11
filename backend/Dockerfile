# backend/Dockerfile
ARG PYTHON_VERSION
FROM python:${PYTHON_VERSION}

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["flask", "run", "--host=0.0.0.0"]
