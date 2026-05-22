FROM node:20-alpine

WORKDIR /app

# Copia dependências primeiro (cache do Docker)
COPY package*.json ./
RUN npm install --omit=dev

# Copia o restante do projeto
COPY src/ ./src/
COPY .env.example ./.env.example

# Cria diretórios necessários
RUN mkdir -p uploads logs data

# Usuário não-root por segurança
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
