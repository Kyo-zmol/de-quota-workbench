# 定额知识库工作台 · Docker
# 用法：自行获取官方定额PDF放入 ./mydata/raw 后执行：
#   docker build -t de-workbench .
#   docker run -p 8730:8730 -v ./mydata:/data de-workbench
FROM node:20-alpine
WORKDIR /app
COPY app/server.js ./server.js
COPY app/public ./public
RUN npm install jszip pdfjs-dist --no-audit --no-fund
ENV NM_DIR=/app/node_modules
COPY scripts ./scripts
ENV WB_ROOT=/data
ENV PORT=8730
EXPOSE 8730
CMD ["node", "server.js"]
