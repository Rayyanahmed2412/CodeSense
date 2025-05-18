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
    //console.log(filePath);
    fs.readFile(filePath, "utf8", (err, fileContent) => {
      if (err) {
        vscode.window.showErrorMessage(`Failed to read file: ${err.message}`);
        return;
      }

      const linter = spawn(
        "python",
        ["-m", "pylint", "--from-stdin", "test.py"],
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

async function generateFixedCodeHandler() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  const document = editor.document;
  const code = document.getText();

  const prompt = `
### Fix the following Python code without changing its logic:
${code}

### Issues detected by Pylint:
${linterOutput}

### Instructions:
1. Fix the above code by addressing all Pylint errors and warnings.
2. Do not alter the core logic or intended functionality of the code.
3. If variable or function names are unclear or ambiguous, replace them with more descriptive and appropriate names.

Only return the corrected code without any explanations, comments, or additional text.
`;
  //console.log(prompt);
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating fixed code using LLM...",
      cancellable: false,
    },
    async (progress) => {
      try {
        const response = await ollama.chat({
          model: "codellama",
          messages: [{ role: "user", content: prompt }],
        });

        let fixedCode = response.message.content;
        const doc = await vscode.workspace.openTextDocument({
          content: fixedCode,
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
