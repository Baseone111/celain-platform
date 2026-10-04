FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements-lock.txt ./requirements-lock.txt
RUN pip install --no-cache-dir -r requirements-lock.txt
COPY backend ./
COPY public/audio ./demo_audio
RUN useradd --uid 10001 --create-home celaine && mkdir -p storage && chown -R celaine:celaine /app
USER celaine
EXPOSE 8000
CMD ["sh", "start.sh"]
