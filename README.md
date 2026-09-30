# PDF Toolkit 📄

A private, fast, full-stack PDF manipulation suite built with React 18, Vite, TypeScript, Tailwind CSS, Express, `pdf-lib`, and `pdfjs-dist`.

Designed with a **privacy-first in-memory architecture**: uploaded files are held purely in RAM and automatically purged after **10 minutes** of inactivity. No files are ever written to disk or third-party cloud storage.

---

## 🌟 Key Features

### 1. Merge PDFs
- Upload 2+ PDF files via drag-and-drop or browse selector.
- Live thumbnails rendered for page 1 of each document.
- Reorder file sequence easily with drag-and-drop powered by `@dnd-kit/sortable`.
- Individual file management and sequence validation.
- Server-side merge using `pdf-lib` returning a combined, high-resolution PDF download.

### 2. Split & Extract PDFs
- Upload any PDF document up to 200MB.
- Responsive visual thumbnail grid for all document pages.
- **Three Split Modes**:
  - **Custom Ranges**: Split by custom ranges like `1-3, 4, 5-8` into individual PDFs.
  - **Every N Pages**: Chunk document into equal page segments (e.g., every 2 pages).
  - **Extract Selected**: Select specific pages visually to extract into a single output file.
- Single-click downloads for all generated PDF partitions.

### 3. Edit, Fill Forms & Sign
- **Fillable PDF Forms (AcroForms)**: Automatically detects interactive form fields (text boxes, checkboxes, radio buttons, dropdowns) and allows live filling and saving.
- **On-Canvas Fill & Stamp**:
  - **Text & Dates**: Click anywhere on the PDF canvas to place text or current dates.
  - **Stamps**: Place Checkmarks (`✓`) or Crosses (`✗`).
  - **Digital Signatures**: Draw or type custom signatures and stamp them onto document pages.
- **Pointer Capture Dragging**: Smoothly drag and position placed elements anywhere on the canvas.
- **Page Operations**:
  - **Rotate**: 90° Clockwise, 90° Counter-Clockwise, or 180°.
  - **Delete Pages**: Select and delete unwanted sheets.
  - **Watermark**: Custom text watermarks with opacity, color picker, font size, and rotation angle.
  - **Page Numbers**: Add bottom-centered page numbering with customizable starting number.
- **Undo / Redo Stack**: Revert any edit operation back to previous document states.

### 4. Privacy & Auto-Cleanup (Zero Disk Storage)
- **10-Minute Auto Cleanup**: Documents expire and are permanently purged from memory after 10 minutes.
- **Zero Disk Storage**: Files are processed exclusively in-memory (`Buffer`) and never written to disk or database.
- **Session Expiry Guards**: Automatic UI detection and re-upload recovery if a session expires.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js**: v18 or later
- **npm**: v9 or later

### Setup Instructions

```bash
# 1. Clone the repository
git clone https://github.com/your-username/pdf-toolkit.git
cd pdf-toolkit

# 2. Install dependencies
npm install

# 3. Start full-stack development server (Express + Vite HMR)
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🛠️ Production Build & Go Live

### 1. Build and Run Locally

```bash
# Build Vite client assets
npm run build

# Start Express production server
npm start
```

The server runs on `http://localhost:3000` (or the port defined in `process.env.PORT`).

---

### 2. Deploy to Cloud (Render / Railway / Fly.io / Heroku)

#### Option A: Railway / Render (Node Web Service)
1. Push your code to GitHub.
2. Connect your repository to **Render** or **Railway**.
3. Set the build command:
   ```bash
   npm install && npm run build
   ```
4. Set the start command:
   ```bash
   npm start
   ```
5. Set environment variables:
   - `NODE_ENV`: `production`
   - `PORT`: `3000` (or provider's default)

#### Option B: Docker Deployment
Use the included Dockerfile configuration or build with:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t pdf-toolkit .
docker run -p 3000:3000 pdf-toolkit
```

---

## 💻 Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v4, Lucide React, React Hot Toast, Zustand
- **Backend**: Node.js, Express, Multer (Memory Storage)
- **PDF Engine**: `pdf-lib` (Document Manipulation & AcroForms), `pdfjs-dist` (Client Canvas Rendering)
- **Drag & Drop**: `@dnd-kit/core`, `@dnd-kit/sortable`

---

## 📄 License

MIT License — free for personal and commercial use.
