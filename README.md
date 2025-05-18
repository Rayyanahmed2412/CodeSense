# CodeSense

CodeSense is a VS Code extension that analyzes code quality using a hybrid approach of linters and LLM-based analysis. It evaluates code for structural integrity, variable naming conventions and logical consistency. CodeSense also provides actionable insights and fixes to improve code maintainability and productivity.

## Prerequisites

Ensure the following are installed on your machine:

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Python](https://www.python.org/) (v3.10+ recommended)
- [VS Code](https://code.visualstudio.com/)
- [Ollama](https://ollama.ai/) (for running CodeLlama locally)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Rayyanahmed2412/CodeSense.git
   cd CodeSense
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up the Python environment:

   Ensure `pylint` is installed:

   ```bash
   python -m venv venv
   venv\Scripts\activate
   pip install pylint
   ```

4. Install and set up **Ollama**:

   Download and configure [Ollama](https://ollama.com/), and ensure the CodeLlama 7B model is available.

   ```bash
   ollama run codellama:7b
   ```

## Running CodeSense Locally

1. Open the project in VS Code:

   ```bash
   code .
   ```

2. Open the extension.js file

3. Click F5 to open the [Extension Development Host]

4. Start analyzing code:

   - Open any code file.
   - On save (`Ctrl+S`), PyLint runs and displays diagnostics.
   - Open Command Palette (`Ctrl+Shift+P`) and run the command "CodeSense: Generate Fixed Code"

## Contribution

Contributions are welcome! If you'd like to improve CodeSense:

1. Fork the repository.
2. Create a feature branch.
3. Submit a pull request with a clear description.

## Future Enhancements

- Support for additional linters (e.g., ESLint, MyPy).
- Deeper integration with LLM for enhanced fix generation.
- Improved performance optimization for large codebases.

## Feedback

Feel free to open an issue for bugs, suggestions, or questions.
