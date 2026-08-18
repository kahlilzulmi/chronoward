import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        runTauriCli()
    }

    fun runTauriCli() {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")

        val tauriDir = File(project.projectDir, rootDirRel).canonicalFile
        val npmRoot = when {
            File(tauriDir, "package.json").exists() -> tauriDir
            File(tauriDir.parentFile, "package.json").exists() -> tauriDir.parentFile
            else -> tauriDir
        }
        val tauriJs = File(npmRoot, "node_modules/@tauri-apps/cli/tauri.js")
        if (!tauriJs.exists()) {
            throw GradleException("Missing ${tauriJs.path}. Run npm install at the repo root first.")
        }

        val node = resolveNodeExecutable()
        val cliArgs = mutableListOf(
            tauriJs.absolutePath,
            "android",
            "android-studio-script",
        )
        if (project.logger.isEnabled(LogLevel.DEBUG)) {
            cliArgs.add("-vv")
        } else if (project.logger.isEnabled(LogLevel.INFO)) {
            cliArgs.add("-v")
        }
        if (release) {
            cliArgs.add("--release")
        }
        cliArgs.add("--target")
        cliArgs.add(target)

        try {
            project.exec {
                workingDir(npmRoot)
                executable(node)
                args(cliArgs)
            }.assertNormalExitValue()
        } catch (e: Exception) {
            throw GradleException(
                "Rust Android build failed while running `$node ${cliArgs.joinToString(" ")}`. " +
                    "If the log shows a WebSocket/CLI-options panic, keep `npm run tauri android dev` " +
                    "or `npx tauri android open` running. Original error: ${e.message}",
                e,
            )
        }
    }

    private fun resolveNodeExecutable(): String {
        if (Os.isFamily(Os.FAMILY_WINDOWS)) {
            val programFiles = System.getenv("ProgramFiles")
            val programFilesX86 = System.getenv("ProgramFiles(x86)")
            val candidates = listOfNotNull(
                programFiles?.let { "$it\\nodejs\\node.exe" },
                programFilesX86?.let { "$it\\nodejs\\node.exe" },
            )
            candidates.firstOrNull { File(it).exists() }?.let { return it }
        }
        return "node"
    }
}
