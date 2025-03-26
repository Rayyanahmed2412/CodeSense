const vscode = require('vscode');
const { spawn } = require("child_process");
const fs = require("fs");


let linterOutput = "";
let diagnosticCollection = vscode.languages.createDiagnosticCollection("diagnosticsLinter");


function runLinter(document){
    if (document.languageId === "python") {
        linterOutput = "";
        const filePath = document.fileName;
        console.log(filePath);
        fs.readFile(filePath, "utf8", (err, fileContent) => {
            if (err) {
                vscode.window.showErrorMessage(`Failed to read file: ${err.message}`);
                return;
            }

            const linter = spawn("python", ["-m", "pylint", "--from-stdin", "dummy.py"], { shell: true });

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


function createDiagnostics(fileUri){
    const outputLines = linterOutput.trim().split("\n");
    const parsedErrors = outputLines.map(line => {
        const match = line.match(/:(\d+):(\d+):\s([A-Z]\d{4}):\s(.+)/);
    
        if (match) {
            const [, lineNo, colNo, errorCode, message] = match;
            let severity = null;
    
            if (errorCode.startsWith('F') || errorCode.startsWith('E')) {
                severity = vscode.DiagnosticSeverity.Error;
            } else if (errorCode.startsWith('I')) {
                severity = vscode.DiagnosticSeverity.Information;
            }
            else{
                severity = vscode.DiagnosticSeverity.Warning;
            }
    
            return {
                line: parseInt(lineNo, 10),
                column: parseInt(colNo, 10),
                message: message.trim(),
                severity
            };
        }
    
        return null;
        }).filter(Boolean);
    
    let diagnosticList = [];
    parsedErrors.forEach(({ line, column, message, severity }) => {
        let startPosition = new vscode.Position(line-1, column);
        let endPosition = new vscode.Position(line-1, column);
        let range = new vscode.Range(startPosition, endPosition);
        let diagnostic = new vscode.Diagnostic(range, message, severity);
        diagnosticList.push(diagnostic);
    });
    
    if(fileUri != undefined){
        diagnosticCollection.set(fileUri, diagnosticList);
    }
}


function activate(context){
    console.log('Congratulations, your extension "codesense" is now active!');
    
    let static_analysis = vscode.workspace.onDidSaveTextDocument((document) => {
        runLinter(document);
    });


    context.subscriptions.push(static_analysis);
}


function deactivate() {}

module.exports = {
	activate,
	deactivate
}
