package com.workspace.remote

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class AgentJob(val id: String, val kind: String, val params: JSONObject)

class SupabaseApi(context: Context) {
    private val baseUrl = context.getString(R.string.supabase_url).trimEnd('/')
    private val anonKey = context.getString(R.string.supabase_anon_key)
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()

    private fun request(path: String, body: String, contentType: String = "application/json; charset=utf-8"): Request {
        require(baseUrl.startsWith("https://")) {
            "Configure WORKSPACE_SUPABASE_URL antes de gerar o APK."
        }
        require(anonKey.isNotBlank()) {
            "Configure WORKSPACE_SUPABASE_ANON_KEY antes de gerar o APK."
        }
        return Request.Builder()
            .url("$baseUrl$path")
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $anonKey")
            .header("Content-Type", contentType)
            .post(body.toRequestBody(contentType.toMediaType()))
            .build()
    }

    private suspend fun rpc(name: String, payload: JSONObject): String = withContext(Dispatchers.IO) {
        client.newCall(request("/rest/v1/rpc/$name", payload.toString())).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("RPC $name falhou (${response.code}): ${text.take(220)}")
            text
        }
    }

    suspend fun register(code: String, name: String): String {
        val raw = rpc(
            "register_self_agent",
            JSONObject().put("p_code", code).put("p_name", name)
                .put("p_os", "Android ${android.os.Build.VERSION.RELEASE}")
        ).trim()
        return if (raw.startsWith("\"")) JSONArray("[$raw]").getString(0) else raw
    }

    suspend fun heartbeat(agentId: String, code: String) {
        rpc(
            "agent_heartbeat",
            JSONObject().put("p_agent_id", agentId).put("p_access_code", code)
                .put("p_os", "Android ${android.os.Build.VERSION.RELEASE}")
        )
    }

    suspend fun reportSpecs(agentId: String, code: String, specs: JSONObject) {
        rpc(
            "agent_report_specs",
            JSONObject().put("p_agent_id", agentId).put("p_access_code", code).put("p_specs", specs)
        )
    }

    suspend fun pendingJobs(code: String): List<AgentJob> {
        val raw = rpc("agent_pending_jobs", JSONObject().put("p_access_code", code))
        val array = if (raw.isBlank()) JSONArray() else JSONArray(raw)
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id")
                if (id.isBlank()) continue
                add(AgentJob(id, item.optString("kind"), item.optJSONObject("params") ?: JSONObject()))
            }
        }
    }

    suspend fun completeJob(code: String, jobId: String, resultUrl: String? = null, error: String? = null) {
        rpc(
            "agent_complete_job",
            JSONObject()
                .put("p_access_code", code)
                .put("p_job_id", jobId)
                .put("p_url", resultUrl ?: JSONObject.NULL)
                .put("p_error", error ?: JSONObject.NULL)
        )
    }

    suspend fun upload(bucket: String, objectPath: String, bytes: ByteArray, contentType: String): String =
        withContext(Dispatchers.IO) {
            val uploadRequest = Request.Builder()
                .url("$baseUrl/storage/v1/object/$bucket/$objectPath")
                .header("apikey", anonKey)
                .header("Authorization", "Bearer $anonKey")
                .header("x-upsert", "true")
                .header("Content-Type", contentType)
                .put(bytes.toRequestBody(contentType.toMediaType()))
                .build()
            client.newCall(uploadRequest).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) error("Upload falhou (${response.code}): ${text.take(180)}")
            }
            "$baseUrl/storage/v1/object/public/$bucket/$objectPath"
        }
}
