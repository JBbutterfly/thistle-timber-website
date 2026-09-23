FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY static ./static
ENV HOMEBOOK_DATA_DIR=/data HOMEBOOK_HOST=0.0.0.0 HOMEBOOK_PORT=8420
VOLUME /data
EXPOSE 8420
CMD ["python", "-m", "app.main"]
