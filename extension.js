const vscode = require("vscode");
const { spawn } = require("child_process");
const fs = require("fs");
const { default: ollama } = require("ollama");

let linterOutput = "";
let diagnosticCollection =
  vscode.languages.createDiagnosticCollection("diagnosticsLinter");

function runLinter(document) {
  if (document.languageId === "python") {
    linterOutput = "";
    const filePath = document.fileName;
    fs.readFile(filePath, "utf8", (err, fileContent) => {
      if (err) {
        vscode.window.showErrorMessage(`Failed to read file: ${err.message}`);
        return;
      }

      const linter = spawn(
        "python",
        ["-m", "pylint", "--from-stdin", filePath.split("\\").pop()],
        { shell: true }
      );

      linter.stdin.write(fileContent);
      linter.stdin.end();

      linter.stdout.on("data", (data) => {
        linterOutput += data.toString();
      });

      linter.stderr.on("data", (data) => {
        vscode.window.showErrorMessage(`Pylint Error: ${data.toString()}`);
      });

      linter.on("close", () => {
        let fileUri = vscode.window.activeTextEditor?.document.uri;
        createDiagnostics(fileUri);
      });
    });
  }
}

function createDiagnostics(fileUri) {
  const outputLines = linterOutput.trim().split("\n");
  const parsedErrors = outputLines
    .map((line) => {
      const match = line.match(/:(\d+):(\d+):\s([A-Z]\d{4}):\s(.+)/);

      if (match) {
        const [, lineNo, colNo, errorCode, message] = match;
        let severity = null;

        if (errorCode.startsWith("F") || errorCode.startsWith("E")) {
          severity = vscode.DiagnosticSeverity.Error;
        } else if (errorCode.startsWith("I")) {
          severity = vscode.DiagnosticSeverity.Information;
        } else {
          severity = vscode.DiagnosticSeverity.Warning;
        }

        return {
          line: parseInt(lineNo, 10),
          column: parseInt(colNo, 10),
          message: message.trim(),
          severity,
        };
      }

      return null;
    })
    .filter(Boolean);

  let diagnosticList = [];
  parsedErrors.forEach(({ line, column, message, severity }) => {
    let startPosition = new vscode.Position(line - 1, column);
    let endPosition = new vscode.Position(line - 1, column);
    let range = new vscode.Range(startPosition, endPosition);
    let diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnosticList.push(diagnostic);
  });

  if (fileUri != undefined) {
    diagnosticCollection.set(fileUri, diagnosticList);
  }
}

const LOGIC_FIX_PROMPT = `[INST] <<SYS>>
You are a strict Python code fixer. The input Python code always contains at least one logical or syntax error. You must identify and correct these. Output only the corrected Python code, with NO extra text or formatting.
<</SYS>>

# Example:
Input:
def is_even(n):
    return n % 2 == 1

Output:
def is_even(n):
    return n % 2 == 0

---

Input:
{code}

Output:
[/INST]`;

const PYLINT_FIX_PROMPT = `[INST] <<SYS>>
You are a code transformation agent. Your task is to fix syntax errors in the provided Python code based on the given Pylint output. Output only the corrected Python code with no explanations, no commentary, and no Markdown formatting.
<</SYS>>

Python code:
{code}

Pylint output:
{linterOutput}

Instructions:
- Output only the corrected Python code.
[/INST]`;

function extractLastOutput(result) {
  const lastOutputIndex = result.lastIndexOf("Output:");
  if (lastOutputIndex === -1) {
    return result.trim();
  }
  return result.substring(lastOutputIndex + "Output:".length).trim();
}

async function runOllamaPrompt(prompt, code, linterOutput = "") {
  const formattedPrompt = prompt
    .replace("{code}", code)
    .replace("{linterOutput}", linterOutput);
  try {
    const response = await ollama.chat({
      model: "codellama",
      options: { temperature: 0.1 },
      messages: [{ role: "user", content: formattedPrompt }],
    });

    const output = response.message.content.trim();
    return extractLastOutput(output);
  } catch (error) {
    throw new Error(`Error running Ollama prompt: ${error.message}`);
  }
}

async function generateFixedCodeHandler() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  const document = editor.document;
  let code = document.getText();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating fixed code...",
      cancellable: false,
    },
    async (progress) => {
      try {
        // Step 1: Fix logical errors
        progress.report({ message: "Fixing logical errors..." });
        code = await runOllamaPrompt(LOGIC_FIX_PROMPT, code);

        // Step 2: Fix Pylint syntax errors
        progress.report({ message: "Fixing Pylint syntax errors..." });
        code = await runOllamaPrompt(PYLINT_FIX_PROMPT, code, linterOutput);

        // Display the final corrected code
        const doc = await vscode.workspace.openTextDocument({
          content: code,
          language: "python",
        });
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error generating fixed code: ${error.message}`
        );
      }
    }
  );
}

function activate(context) {
  console.log('Congratulations, your extension "codesense" is now active!');

  let static_analysis = vscode.workspace.onDidSaveTextDocument((document) => {
    runLinter(document);
  });

  let generateFixedCode = vscode.commands.registerCommand(
    "codesense.generateFixedCode",
    generateFixedCodeHandler
  );

  context.subscriptions.push(generateFixedCode, static_analysis);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
