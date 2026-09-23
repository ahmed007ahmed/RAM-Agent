package com.ram.agent;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;

public class LocalDatabase extends SQLiteOpenHelper {

    private static final String DATABASE_NAME = "ram_v4.db";
    private static final int DATABASE_VERSION = 1;

    private static final String TABLE_TASKS = "tasks";

    public LocalDatabase(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE " + TABLE_TASKS + " (" +
            "id INTEGER PRIMARY KEY AUTOINCREMENT," +
            "title TEXT NOT NULL," +
            "status TEXT NOT NULL DEFAULT 'OPEN'," +
            "created_at INTEGER NOT NULL" +
            ")"
        );
    }

    @Override
    public void onUpgrade(
            SQLiteDatabase db,
            int oldVersion,
            int newVersion) {

        db.execSQL("DROP TABLE IF EXISTS " + TABLE_TASKS);
        onCreate(db);
    }

    public long addTask(String title) {

        SQLiteDatabase db = getWritableDatabase();

        ContentValues values = new ContentValues();
        values.put("title", title);
        values.put("status", "OPEN");
        values.put("created_at", System.currentTimeMillis());

        return db.insert(TABLE_TASKS, null, values);
    }

    public ArrayList<String> getOpenTasks() {

        ArrayList<String> tasks = new ArrayList<>();

        SQLiteDatabase db = getReadableDatabase();

        Cursor cursor = db.query(
                TABLE_TASKS,
                new String[]{"id", "title"},
                "status = ?",
                new String[]{"OPEN"},
                null,
                null,
                "id DESC"
        );

        try {
            while (cursor.moveToNext()) {

                long id = cursor.getLong(
                        cursor.getColumnIndexOrThrow("id")
                );

                String title = cursor.getString(
                        cursor.getColumnIndexOrThrow("title")
                );

                tasks.add(id + " - " + title);
            }
        } finally {
            cursor.close();
        }

        return tasks;
    }

    public boolean completeTask(long id) {

        SQLiteDatabase db = getWritableDatabase();

        ContentValues values = new ContentValues();
        values.put("status", "DONE");

        int rows = db.update(
                TABLE_TASKS,
                values,
                "id = ?",
                new String[]{String.valueOf(id)}
        );

        return rows > 0;
    }

    public boolean deleteTask(long id) {

        SQLiteDatabase db = getWritableDatabase();

        int rows = db.delete(
                TABLE_TASKS,
                "id = ?",
                new String[]{String.valueOf(id)}
        );

        return rows > 0;
    }

    public int countOpenTasks() {

        SQLiteDatabase db = getReadableDatabase();

        Cursor cursor = db.rawQuery(
                "SELECT COUNT(*) FROM " +
                TABLE_TASKS +
                " WHERE status = 'OPEN'",
                null
        );

        try {
            if (cursor.moveToFirst()) {
                return cursor.getInt(0);
            }
        } finally {
            cursor.close();
        }

        return 0;
    }
}
