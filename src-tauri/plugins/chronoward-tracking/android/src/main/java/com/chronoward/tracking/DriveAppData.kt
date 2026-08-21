package com.chronoward.tracking

import android.app.Activity
import com.google.android.gms.auth.GoogleAuthUtil
import com.google.android.gms.auth.UserRecoverableAuthException
import com.google.android.gms.auth.api.signin.GoogleSignIn
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

object DriveAppData {
    private const val FILE_NAME = "usage.jsonl"
    private const val SCOPE = "oauth2:https://www.googleapis.com/auth/drive.appdata"

    fun download(activity: Activity): String {
        val token = accessToken(activity)
        val fileId = findFileId(token) ?: return ""
        val conn = get("https://www.googleapis.com/drive/v3/files/$fileId?alt=media", token)
        val code = conn.responseCode
        val body = readBody(conn)
        if (code == 404) {
            return ""
        }
        if (code !in 200..299) {
            throw IllegalStateException("Drive download failed ($code).")
        }
        return body
    }

    fun upload(activity: Activity, contents: String) {
        val token = accessToken(activity)
        val fileId = findFileId(token) ?: createFile(token)
        val conn = request(
            "PATCH",
            "https://www.googleapis.com/upload/drive/v3/files/$fileId?uploadType=media",
            token,
            "text/plain; charset=UTF-8",
            contents,
        )
        val code = conn.responseCode
        readBody(conn)
        if (code !in 200..299) {
            throw IllegalStateException("Drive upload failed ($code).")
        }
    }

    private fun accessToken(activity: Activity): String {
        val account = GoogleSignIn.getLastSignedInAccount(activity)
            ?: throw IllegalStateException("Sign in with Google before Drive sync.")
        val androidAccount = account.account
            ?: throw IllegalStateException("Google account is missing.")
        return try {
            GoogleAuthUtil.getToken(activity, androidAccount, SCOPE)
        } catch (error: UserRecoverableAuthException) {
            throw IllegalStateException("Grant Drive app data, then Sign in with Google again.")
        }
    }

    private fun findFileId(token: String): String? {
        val query = URLEncoder.encode("name = '$FILE_NAME'", StandardCharsets.UTF_8.name())
        val conn = get(
            "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&q=$query",
            token,
        )
        val code = conn.responseCode
        val body = readBody(conn)
        if (code == 401 || code == 403) {
            throw IllegalStateException("Drive access denied. Sign in with Google again to grant drive.appdata.")
        }
        if (code !in 200..299) {
            throw IllegalStateException("Drive list failed ($code).")
        }
        val files = JSONObject(body).optJSONArray("files") ?: return null
        for (i in 0 until files.length()) {
            val file = files.optJSONObject(i) ?: continue
            if (file.optString("name") == FILE_NAME) {
                val id = file.optString("id")
                if (id.isNotBlank()) {
                    return id
                }
            }
        }
        return null
    }

    private fun createFile(token: String): String {
        val meta = JSONObject()
            .put("name", FILE_NAME)
            .put("parents", org.json.JSONArray().put("appDataFolder"))
            .toString()
        val conn = request(
            "POST",
            "https://www.googleapis.com/drive/v3/files",
            token,
            "application/json",
            meta,
        )
        val code = conn.responseCode
        val body = readBody(conn)
        if (code !in 200..299) {
            throw IllegalStateException("Drive create failed ($code).")
        }
        val id = JSONObject(body).optString("id")
        if (id.isBlank()) {
            throw IllegalStateException("Drive create returned no file id.")
        }
        return id
    }

    private fun get(url: String, token: String): HttpURLConnection {
        return request("GET", url, token, "application/json", null)
    }

    private fun request(
        method: String,
        url: String,
        token: String,
        contentType: String,
        body: String?,
    ): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("Content-Type", contentType)
        conn.connectTimeout = 20000
        conn.readTimeout = 20000
        if (body != null) {
            conn.doOutput = true
            OutputStreamWriter(conn.outputStream, StandardCharsets.UTF_8).use { writer ->
                writer.write(body)
            }
        }
        return conn
    }

    private fun readBody(conn: HttpURLConnection): String {
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        if (stream == null) {
            return ""
        }
        return BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
            reader.readText()
        }
    }
}
