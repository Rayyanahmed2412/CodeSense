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
        createDiagnostics(document.uri);
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
        let severity =
          errorCode.startsWith("F") || errorCode.startsWith("E")
            ? vscode.DiagnosticSeverity.Error
            : errorCode.startsWith("I")
            ? vscode.DiagnosticSeverity.Information
            : vscode.DiagnosticSeverity.Warning;

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

  let diagnosticList = parsedErrors.map(
    ({ line, column, message, severity }) => {
      let range = new vscode.Range(
        new vscode.Position(line - 1, column),
        new vscode.Position(line - 1, column)
      );
      return new vscode.Diagnostic(range, message, severity);
    }
  );

  if (fileUri) {
    diagnosticCollection.set(fileUri, diagnosticList);
  }
}

const LOGIC_FIX_PROMPT = `[INST] <<SYS>>
You are a strict Python code fixer. The input Python code always contains at least one logical or syntax error. You must identify and correct these. Output only the corrected Python code, with NO extra text or formatting.
<</SYS>>

Input:
{code}

Output:
[/INST]`;

const SYNTAX_FIX_PROMPT = `[INST] <<SYS>>
You are a code transformation agent. Your task is to fix syntax errors in the provided Python code. Output only the corrected Python code with no explanations or formatting.
<</SYS>>

Input:
{code}

Output:
[/INST]`;

const PYLINT_FIX_PROMPT = `[INST] <<SYS>>
You are a code transformation agent. Your task is to fix remaining Pylint errors in the provided Python code based on the given Pylint output. Output only the corrected Python code with no explanations or formatting.
<</SYS>>

Python code:
{code}

Pylint output:
{linterOutput}

Output:
[/INST]`;

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
    return response.message.content.trim();
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

  let code = editor.document.getText();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating fixed code...",
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: "Fixing logical errors..." });
        code = await runOllamaPrompt(LOGIC_FIX_PROMPT, code);

        progress.report({ message: "Fixing syntax errors..." });
        code = await runOllamaPrompt(SYNTAX_FIX_PROMPT, code);

        progress.report({ message: "Fixing remaining Pylint errors..." });
        code = await runOllamaPrompt(PYLINT_FIX_PROMPT, code, linterOutput);

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
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(runLinter),
    vscode.commands.registerCommand(
      "codesense.generateFixedCode",
      generateFixedCodeHandler
    )
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
