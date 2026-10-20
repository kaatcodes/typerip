' Starts the local TypeRip server without a console window and opens it in the browser.
' If TypeRip is already running, this just opens it again.
' If nothing happens, run "node server.js" in this folder to see the error.
Set shell = CreateObject("WScript.Shell")
appDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = appDir
shell.Run "node """ & appDir & "\server.js""", 0, False
