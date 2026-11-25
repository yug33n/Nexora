package app.nexora.mobile;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "NotesFolder")
public class NotesFolderPlugin extends Plugin {
    private static final String LEGACY_APP_FOLDER = "Nexora";
    private static final String SPACE_METADATA = ".nexora-space.json";
    private static final String SPACE_STAGING_PREFIX = ".nexora-space-staging-";
    private static final String LEGACY_FILE = "nexora.json";
    private static final String LEGACY_FORMAT_FILE = "nexora-storage.json";
    private static final String FORMAT_FILE = "nexora-layout.json";
    private static final String TEMP_FILE = "nexora-write.tmp";
    private static final Pattern NOTE_FILE = Pattern.compile("nexora-note-([0-9]{12})-([a-zA-Z0-9_-]+)[.]md");
    private static final Pattern SPACE_FILE = Pattern.compile("nexora-space-([0-9]{12})-([a-zA-Z0-9_-]+)[.]json");
    private static final String FOLDER_KEY = "folder";
    private static final int ACCESS_FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION
        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    private record SpaceFolder(Uri directory, JSONObject data, long order) {}

    @PluginMethod
    public void open(PluginCall call) {
        String folder = preferences().getString(FOLDER_KEY, null);
        if (folder == null) {
            call.resolve();
            return;
        }

        try {
            Uri tree = Uri.parse(folder);
            if (!hasFolderAccess(tree)) throw new IOException("Folder access revoked");
            resolveData(call, openFolder(tree, null));
        } catch (Exception error) {
            call.reject("Cannot open notes folder", error);
        }
    }

    @PluginMethod
    public void pick(PluginCall call) {
        pickFolder(call);
    }

    @PluginMethod
    public void move(PluginCall call) {
        pickFolder(call);
    }

    private void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
        intent.addFlags(ACCESS_FLAGS | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent intent = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || intent == null || intent.getData() == null) {
            call.resolve();
            return;
        }

        execute(() -> useFolder(call, intent));
    }

    private void useFolder(PluginCall call, Intent intent) {
        Uri tree = intent.getData();
        String previousFolder = preferences().getString(FOLDER_KEY, null);
        boolean newFolder = !tree.toString().equals(previousFolder);
        boolean moving = "move".equals(call.getMethodName());
        if (moving && !newFolder) {
            call.resolve();
            return;
        }
        boolean granted = false;
        try {
            int flags = intent.getFlags() & ACCESS_FLAGS;
            if (flags != ACCESS_FLAGS) throw new IOException("Read and write access required");
            resolver().takePersistableUriPermission(tree, flags);
            granted = true;

            String data = moving
                ? transferFolder(previousFolder, tree)
                : openFolder(tree, call.getString("initialData", "{\"spaces\":[],\"notes\":[]}"));

            if (!preferences().edit().putString(FOLDER_KEY, tree.toString()).commit()) {
                preferences().edit().putString(FOLDER_KEY, previousFolder).apply();
                throw new IOException("Cannot remember notes folder");
            }
            if (newFolder && previousFolder != null) release(Uri.parse(previousFolder));
            resolveData(call, data);
        } catch (Exception error) {
            if (newFolder && granted) release(tree);
            call.reject("Cannot use selected folder",
                error instanceof FolderConflict ? "FOLDER_CONFLICT" : "FOLDER_ERROR", error);
        }
    }

    private static class FolderConflict extends IOException {}

    private String transferFolder(String previousFolder, Uri target) throws Exception {
        if (previousFolder == null) throw new IOException("Notes folder missing");
        Uri source = Uri.parse(previousFolder);
        if (!hasFolderAccess(source)) throw new IOException("Folder access revoked");

        JSONObject data = new JSONObject(openFolder(source, null));
        Map<String, Uri> files = listFiles(target);
        Map<String, Uri> directories = listDirectories(target);
        Uri nested = directories.get(LEGACY_APP_FOLDER);
        if (files.containsKey(SPACE_METADATA) || (!files.containsKey(FORMAT_FILE)
            && (files.containsKey(LEGACY_FILE) || files.containsKey(LEGACY_FORMAT_FILE)
                || (nested != null && hasLegacySpaceFolders(listFiles(nested)))))) {
            throw new FolderConflict();
        }

        JSONObject existing = readSpaceFolders(target);
        JSONArray spaces = data.getJSONArray("spaces");
        requirePrefix(existing.getJSONArray("spaces"), spaces);
        Map<String, JSONArray> notes = groupNotes(data.getJSONArray("notes"));
        Map<String, JSONArray> existingNotes = groupNotes(existing.getJSONArray("notes"));
        for (Map.Entry<String, JSONArray> entry : existingNotes.entrySet()) {
            requirePrefix(entry.getValue(), notes.get(entry.getKey()));
        }

        Map<String, SpaceFolder> targetSpaces = findSpaces(target);
        long order = targetSpaces.values().stream().mapToLong(SpaceFolder::order).max().orElse(-1) + 1;
        for (int index = targetSpaces.size(); index < spaces.length(); index++) {
            createSpace(target, targetSpaces, order++, spaces.getJSONObject(index));
        }
        for (Map.Entry<String, JSONArray> entry : notes.entrySet()) {
            Uri directory = targetSpaces.get(entry.getKey()).directory();
            Map<String, Uri> noteFiles = listFiles(directory);
            long noteOrder = nextNoteOrder(noteFiles);
            JSONArray copied = existingNotes.get(entry.getKey());
            for (int index = copied == null ? 0 : copied.length(); index < entry.getValue().length(); index++) {
                saveNote(directory, noteFiles, noteOrder++, entry.getValue().getJSONObject(index));
            }
        }
        String transferred = readSpaceFolders(target).toString();
        if (!data.toString().equals(transferred)) throw new IOException("Cannot verify transferred data");
        if (!files.containsKey(FORMAT_FILE)) publish(target, files, FORMAT_FILE, "{\"version\":4}");
        return transferred;
    }

    private Map<String, JSONArray> groupNotes(JSONArray notes) throws Exception {
        Map<String, JSONArray> grouped = new HashMap<>();
        for (int index = 0; index < notes.length(); index++) {
            JSONObject note = notes.getJSONObject(index);
            grouped.computeIfAbsent(note.getString("spaceId"), key -> new JSONArray()).put(note);
        }
        return grouped;
    }

    private void requirePrefix(JSONArray existing, JSONArray source) throws Exception {
        if (source == null || existing.length() > source.length()) throw new FolderConflict();
        for (int index = 0; index < existing.length(); index++) {
            if (!existing.getJSONObject(index).toString().equals(source.getJSONObject(index).toString())) {
                throw new FolderConflict();
            }
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        try {
            String folder = preferences().getString(FOLDER_KEY, null);
            if (folder == null) throw new IOException("Notes folder missing");
            Uri app = Uri.parse(folder);
            if (!listFiles(app).containsKey(FORMAT_FILE)) {
                throw new IOException("Notes folder is not initialized");
            }

            Map<String, SpaceFolder> spaces = findSpaces(app);
            JSONObject item = new JSONObject(call.getString("item", ""));
            switch (call.getString("kind", "")) {
                case "notes" -> {
                    SpaceFolder space = spaces.get(item.getString("spaceId"));
                    if (space == null) throw new IOException("Space folder missing");
                    Map<String, Uri> files = listFiles(space.directory());
                    saveNote(space.directory(), files, nextNoteOrder(files), item);
                }
                case "spaces" -> {
                    long order = spaces.values().stream().mapToLong(SpaceFolder::order).max().orElse(-1) + 1;
                    createSpace(app, spaces, order, item);
                }
                default -> throw new IOException("Unknown item type");
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Cannot save notes", error);
        }
    }

    private String openFolder(Uri root, String initialData) throws Exception {
        Map<String, Uri> files = listFiles(root);
        if (!files.containsKey(FORMAT_FILE)) {
            if (!hasLegacySpaceFolders(files)) {
                Uri nested = listDirectories(root).get(LEGACY_APP_FOLDER);
                JSONObject source = nested != null && hasLegacySpaceFolders(listFiles(nested))
                    ? readSpaceFolders(nested)
                    : loadPreviousStorage(files, initialData);
                migrate(root, source);
            }
            publish(root, files, FORMAT_FILE, "{\"version\":4}");
        }
        return readSpaceFolders(root).toString();
    }

    private JSONObject readSpaceFolders(Uri app) throws Exception {
        JSONArray spaces = new JSONArray();
        JSONArray notes = new JSONArray();
        List<SpaceFolder> ordered = new ArrayList<>(findSpaces(app).values());
        ordered.sort(Comparator.comparingLong(SpaceFolder::order));
        for (SpaceFolder space : ordered) {
            spaces.put(space.data());
            Map<String, Uri> noteFiles = listFiles(space.directory());
            appendNotes(noteFiles, notes, space.data().getString("id"));
        }
        return new JSONObject().put("spaces", spaces).put("notes", notes);
    }

    private boolean hasLegacySpaceFolders(Map<String, Uri> files) throws Exception {
        Uri format = files.get(LEGACY_FORMAT_FILE);
        return format != null && new JSONObject(read(format)).getInt("version") == 3;
    }

    private JSONObject loadPreviousStorage(Map<String, Uri> files, String initialData) throws Exception {
        if (files.containsKey(LEGACY_FORMAT_FILE)) {
            JSONArray spaces = new JSONArray();
            JSONArray notes = new JSONArray();
            for (Map.Entry<String, Uri> file : files.entrySet()) {
                if (SPACE_FILE.matcher(file.getKey()).matches()) {
                    spaces.put(new JSONObject(read(file.getValue())));
                }
            }
            appendNotes(files, notes, null);
            return new JSONObject().put("spaces", spaces).put("notes", notes);
        }
        Uri legacy = files.get(LEGACY_FILE);
        if (legacy != null) return new JSONObject(read(legacy));
        if (initialData == null) throw new IOException("Notes storage missing");
        return new JSONObject(initialData);
    }

    private void migrate(Uri app, JSONObject source) throws Exception {
        Map<String, SpaceFolder> spaces = findSpaces(app);
        Map<String, Map<String, Uri>> noteFiles = new HashMap<>();
        JSONArray oldSpaces = source.getJSONArray("spaces");
        JSONArray oldNotes = source.getJSONArray("notes");
        for (int index = 0; index < oldSpaces.length(); index++) {
            JSONObject oldSpace = oldSpaces.getJSONObject(index);
            String id = oldSpace.getString("id");
            SpaceFolder space = createSpace(app, spaces, index, oldSpace);
            noteFiles.put(id, listFiles(space.directory()));
        }
        for (int index = 0; index < oldNotes.length(); index++) {
            JSONObject note = oldNotes.getJSONObject(index);
            String id = note.getString("spaceId");
            SpaceFolder space = spaces.get(id);
            Map<String, Uri> files = noteFiles.get(id);
            if (space == null || files == null) throw new IOException("Note belongs to a missing space");
            saveNote(space.directory(), files, index, note);
        }
    }

    private Map<String, SpaceFolder> findSpaces(Uri app) throws Exception {
        Map<String, SpaceFolder> spaces = new HashMap<>();
        for (Map.Entry<String, Uri> entry : listDirectories(app).entrySet()) {
            if (entry.getKey().startsWith(SPACE_STAGING_PREFIX)) continue;
            Uri directory = entry.getValue();
            Uri file = listFiles(directory).get(SPACE_METADATA);
            if (file == null) continue;
            JSONObject metadata = new JSONObject(read(file));
            JSONObject data = new JSONObject().put("id", metadata.getString("id"))
                .put("name", metadata.getString("name"));
            SpaceFolder old = spaces.put(data.getString("id"), new SpaceFolder(directory, data, metadata.getLong("order")));
            if (old != null) throw new IOException("Duplicate space ID");
        }
        return spaces;
    }

    private SpaceFolder createSpace(Uri app, Map<String, SpaceFolder> spaces, long order, JSONObject data) throws Exception {
        String id = data.getString("id");
        if (!id.matches("[a-zA-Z0-9_-]+")) throw new IOException("Invalid space ID");
        SpaceFolder existing = spaces.get(id);
        if (existing != null) return existing;
        Map<String, Uri> directories = listDirectories(app);
        String name = availableSpaceName(data.getString("name"), directories, listFiles(app));
        String stagingName = SPACE_STAGING_PREFIX + id;
        Uri staging = directories.get(stagingName);
        if (staging == null) staging = createDirectory(app, stagingName);
        Map<String, Uri> files = listFiles(staging);
        if (!files.containsKey(SPACE_METADATA)) {
            JSONObject metadata = new JSONObject().put("id", id).put("name", data.getString("name")).put("order", order);
            publish(staging, files, SPACE_METADATA, metadata.toString());
        }
        Uri directory = DocumentsContract.renameDocument(resolver(), staging, name);
        if (directory == null) throw new IOException("Cannot publish space folder");
        SpaceFolder space = new SpaceFolder(directory, data, order);
        spaces.put(id, space);
        return space;
    }

    private String availableSpaceName(String title, Map<String, Uri> directories, Map<String, Uri> files) {
        String base = title.replaceAll("[\\p{Cntrl}/\\\\:*?\"<>|]", "_").trim()
            .replaceAll("^\\.+|[. ]+$", "");
        if (base.isEmpty()) base = "Пространство";
        while (base.getBytes(StandardCharsets.UTF_8).length > 230) {
            base = base.substring(0, base.offsetByCodePoints(base.length(), -1));
        }
        Set<String> occupied = new HashSet<>();
        for (String name : directories.keySet()) occupied.add(name.toLowerCase(Locale.ROOT));
        for (String name : files.keySet()) occupied.add(name.toLowerCase(Locale.ROOT));
        occupied.add(TEMP_FILE);
        occupied.add(FORMAT_FILE);
        String name = base;
        for (int suffix = 2; occupied.contains(name.toLowerCase(Locale.ROOT)); suffix++) {
            name = base + " (" + suffix + ")";
        }
        return name;
    }

    private void appendNotes(Map<String, Uri> files, JSONArray notes, String spaceId) throws Exception {
        for (Map.Entry<String, Uri> file : files.entrySet()) {
            Matcher name = NOTE_FILE.matcher(file.getKey());
            if (!name.matches()) continue;
            JSONObject note = MarkdownNote.decode(name.group(2), read(file.getValue()));
            if (spaceId != null) note.put("spaceId", spaceId);
            notes.put(note);
        }
    }

    private long nextNoteOrder(Map<String, Uri> files) {
        long next = 0;
        for (String name : files.keySet()) {
            Matcher item = NOTE_FILE.matcher(name);
            if (item.matches()) next = Math.max(next, Long.parseLong(item.group(1)) + 1);
        }
        return next;
    }

    private void saveNote(Uri directory, Map<String, Uri> files, long order, JSONObject note) throws Exception {
        String name = String.format(Locale.ROOT, "nexora-note-%012d-%s.md", order, note.getString("id"));
        if (!NOTE_FILE.matcher(name).matches()) throw new IOException("Invalid note filename");
        if (!files.containsKey(name)) publish(directory, files, name, MarkdownNote.encode(note));
    }

    private Uri createDirectory(Uri parent, String name) throws IOException {
        Uri directory = DocumentsContract.createDocument(resolver(), documentUri(parent),
            DocumentsContract.Document.MIME_TYPE_DIR, name);
        if (directory == null) throw new IOException("Cannot create folder " + name);
        return directory;
    }

    private void publish(Uri tree, Map<String, Uri> files, String name, String content) throws Exception {
        // Write and close the document before exposing its final name to readers.
        Uri staging = files.remove(TEMP_FILE);
        if (staging == null) {
            Uri directory = documentUri(tree);
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension("tmp");
            staging = DocumentsContract.createDocument(resolver(), directory,
                mime == null ? "application/octet-stream" : mime, TEMP_FILE);
            if (staging == null) throw new IOException("Cannot create staging document");
        }
        try {
            write(staging, content);
            if (DocumentsContract.renameDocument(resolver(), staging, name) == null) {
                throw new IOException("Cannot publish " + name);
            }
        } catch (Exception error) {
            try {
                DocumentsContract.deleteDocument(resolver(), staging);
            } catch (Exception cleanupError) {
                error.addSuppressed(cleanupError);
            }
            throw error;
        }
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("notes_folder", Activity.MODE_PRIVATE);
    }

    private ContentResolver resolver() {
        return getContext().getContentResolver();
    }

    private boolean hasFolderAccess(Uri tree) {
        for (UriPermission permission : resolver().getPersistedUriPermissions()) {
            if (tree.equals(permission.getUri()) && permission.isReadPermission() && permission.isWritePermission()) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Uri> listFiles(Uri tree) throws IOException {
        return listChildren(tree, false);
    }

    private Map<String, Uri> listDirectories(Uri tree) throws IOException {
        return listChildren(tree, true);
    }

    private String directoryId(Uri uri) {
        return uri.getPathSegments().size() > 2
            ? DocumentsContract.getDocumentId(uri) : DocumentsContract.getTreeDocumentId(uri);
    }

    private Uri documentUri(Uri uri) {
        return DocumentsContract.buildDocumentUriUsingTree(uri, directoryId(uri));
    }

    private Map<String, Uri> listChildren(Uri tree, boolean directories) throws IOException {
        String directoryId = directoryId(tree);
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, directoryId);
        String[] columns = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        };
        Map<String, Uri> files = new TreeMap<>();
        try (Cursor cursor = resolver().query(children, columns, null, null, null)) {
            if (cursor == null) throw new IOException("Cannot read notes folder");
            while (cursor.moveToNext()) {
                if (directories == DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(2))) {
                    files.put(cursor.getString(1), DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0)));
                }
            }
        }
        return files;
    }

    private String read(Uri file) throws Exception {
        try (InputStream stream = resolver().openInputStream(file)) {
            if (stream == null) throw new IOException("Cannot read notes file");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int count;
            while ((count = stream.read(chunk)) != -1) buffer.write(chunk, 0, count);
            return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void write(Uri file, String data) throws IOException {
        try (OutputStream stream = resolver().openOutputStream(file, "wt")) {
            if (stream == null) throw new IOException("Cannot write notes file");
            stream.write(data.getBytes(StandardCharsets.UTF_8));
        }
    }

    private void resolveData(PluginCall call, String data) {
        JSObject result = new JSObject();
        result.put("data", data);
        call.resolve(result);
    }

    private void release(Uri tree) {
        try {
            resolver().releasePersistableUriPermission(tree, ACCESS_FLAGS);
        } catch (SecurityException ignored) {
            // Android may already have revoked access.
        }
    }
}
