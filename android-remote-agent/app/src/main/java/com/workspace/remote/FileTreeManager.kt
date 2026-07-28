package com.workspace.remote

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject

class FileTreeManager(private val context: Context) {
    private val prefs = context.getSharedPreferences("workspace_remote", Context.MODE_PRIVATE)

    private fun root(): DocumentFile? {
        val saved = prefs.getString("shared_tree_uri", null) ?: return null
        return DocumentFile.fromTreeUri(context, Uri.parse(saved))
    }

    private fun safeParts(relative: String): List<String> =
        relative.replace('\\', '/').split('/').map { it.trim() }
            .filter { it.isNotBlank() && it != "." }
            .also { parts -> require(parts.none { it == ".." }) { "Caminho inválido." } }

    private fun resolve(relative: String): DocumentFile? {
        var current = root() ?: return null
        for (part in safeParts(relative)) current = current.findFile(part) ?: return null
        return current
    }

    fun list(relative: String): JSONObject {
        val folder = resolve(relative) ?: error("Pasta não encontrada ou não autorizada.")
        require(folder.isDirectory) { "O caminho não é uma pasta." }
        val entries = JSONArray()
        folder.listFiles()
            .sortedWith(compareByDescending<DocumentFile> { it.isDirectory }.thenBy { it.name?.lowercase() })
            .take(500)
            .forEach { file ->
                entries.put(
                    JSONObject().put("name", file.name ?: "arquivo").put("isDir", file.isDirectory)
                        .put("size", file.length()).put("mime", file.type ?: JSONObject.NULL)
                )
            }
        return JSONObject()
            .put("dir", safeParts(relative).joinToString("/"))
            .put("parent", safeParts(relative).dropLast(1).joinToString("/"))
            .put("sep", "/")
            .put("entries", entries)
    }

    fun mkdir(relative: String, name: String) {
        require(name.isNotBlank() && !name.contains('/') && !name.contains('\\')) { "Nome inválido." }
        val folder = resolve(relative) ?: error("Pasta não encontrada.")
        require(folder.isDirectory && folder.createDirectory(name.trim()) != null) { "Não foi possível criar a pasta." }
    }

    fun rename(relative: String, name: String) {
        require(name.isNotBlank() && !name.contains('/') && !name.contains('\\')) { "Nome inválido." }
        require(resolve(relative)?.renameTo(name.trim()) == true) { "Não foi possível renomear." }
    }

    fun delete(relative: String) {
        require(relative.isNotBlank()) { "A pasta principal não pode ser removida." }
        require(resolve(relative)?.delete() == true) { "Não foi possível excluir." }
    }
}
