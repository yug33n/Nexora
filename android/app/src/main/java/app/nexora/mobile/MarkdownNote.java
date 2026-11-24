package app.nexora.mobile;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.IOException;

final class MarkdownNote {
    private static final String SPACE = "spaceId: ";
    private static final String TITLE = "title: ";

    private MarkdownNote() {}

    static String encode(JSONObject note) throws JSONException {
        return "---\n"
            + SPACE + JSONObject.quote(note.getString("spaceId")) + "\n"
            + TITLE + JSONObject.quote(note.getString("title")) + "\n"
            + "---\n\n"
            + note.getString("body");
    }

    static JSONObject decode(String id, String markdown) throws JSONException, IOException {
        String[] parts = markdown.split("\\r?\\n", 6);
        if (parts.length != 6 || !"---".equals(parts[0]) || !"---".equals(parts[3])
            || !parts[1].startsWith(SPACE) || !parts[2].startsWith(TITLE) || !parts[4].isEmpty()) {
            throw new IOException("Invalid Markdown note header");
        }
        return new JSONObject()
            .put("id", id)
            .put("spaceId", parseField(parts[1], SPACE))
            .put("title", parseField(parts[2], TITLE))
            .put("body", parts[5]);
    }

    private static String parseField(String line, String prefix) throws JSONException, IOException {
        JSONTokener parser = new JSONTokener(line.substring(prefix.length()));
        Object value = parser.nextValue();
        if (!(value instanceof String) || parser.nextClean() != 0) {
            throw new IOException("Invalid " + prefix.trim() + " field");
        }
        return (String) value;
    }
}
