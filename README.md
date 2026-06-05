# 📖 Proton Books

Proton Books is a powerful, multi-source ebook search engine and reader. It aggregates digital libraries to help you find and read books instantly without leaving your browser.

## ✨ Features

- **Unified Search**: Search across multiple digital libraries simultaneously:
  - **Project Gutenberg**: High-quality public domain classics.
  - **Open Library / Internet Archive**: Broad coverage of millions of books.
  - **Anna's Archive**: Access to a vast collection of mirrored shadow libraries.
- **CORS-Free Reading**: Built-in backend proxy to bypass browser restrictions, allowing you to read EPUBs directly from external sources.
- **Integrated Reader**: Powered by `epub.js` for a seamless, paginated reading experience.
- **Dark Mode**: A sleek, eye-friendly dark theme for nighttime reading.
- **Local Uploads**: Drag-and-drop or upload your own `.epub` files to read them privately.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/protonexe/proton-books.git
   cd proton-books
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   `http://localhost:3000`

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: HTML5, Tailwind CSS, JavaScript
- **Reader**: [epub.js](https://github.com/futurepress/epub.js)
- **APIs**: Gutendex, Open Library Search API, Anna's Archive

## 📜 License
MIT
