package com.deepchat.app;

import com.tencent.wcdb.base.WCDBException;
import com.tencent.wcdb.core.Database;
import com.tencent.wcdb.core.Handle;
import com.tencent.wcdb.core.Table;
import com.tencent.wcdb.core.Transaction;
import com.tencent.wcdb.winq.Order;

import java.util.ArrayList;
import java.util.List;

/** 单表 KV 存储：会话、摘要、附件原件和导入暂存都以 kind 前缀区分。 */
public final class WcdbStore {
    private static final String TABLE = "kv";
    private final Database db;
    private final Table<WcdbRecord> table;

    public WcdbStore(String path) throws WCDBException {
        db = new Database(path);
        db.createTable(TABLE, DBWcdbRecord.INSTANCE);
        table = db.getTable(TABLE, DBWcdbRecord.INSTANCE);
    }

    private static String key(String kind, String id) {
        return kind + ':' + id;
    }

    public WcdbRecord get(String kind, String id) throws WCDBException {
        return table.getFirstObject(DBWcdbRecord.id.eq(key(kind, id)));
    }

    public List<WcdbRecord> getAll(String kind) throws WCDBException {
        return table.getAllObjects(DBWcdbRecord.id.like(kind + ":%"));
    }

    public List<WcdbRecord> getStagingSessionPage(String after) throws WCDBException {
        return table.getAllObjects(
            DBWcdbRecord.id.gt(key("ss", after)).and(DBWcdbRecord.id.lt("ss;")),
            DBWcdbRecord.id.order(Order.Asc),
            8
        );
    }

    public void put(final List<WcdbRecord> rows) throws WCDBException {
        if (rows.isEmpty()) {
            return;
        }
        db.runTransaction(new Transaction() {
            @Override
            public boolean insideTransaction(Handle handle) throws WCDBException {
                for (WcdbRecord row : rows) {
                    handle.insertOrReplaceObject(row, DBWcdbRecord.allFields(), TABLE);
                }
                return true;
            }
        });
    }

    public void remove(final List<String> keys) throws WCDBException {
        if (keys.isEmpty()) {
            return;
        }
        db.runTransaction(new Transaction() {
            @Override
            public boolean insideTransaction(Handle handle) throws WCDBException {
                for (String key : keys) {
                    handle.deleteObjects(TABLE, DBWcdbRecord.id.eq(key));
                }
                return true;
            }
        });
    }

    /** 仅更改记录前缀，BLOB 留在数据库内，切换失败时回滚正式历史。 */
    public void commitHistory() throws WCDBException {
        db.runTransaction(new Transaction() {
            @Override
            public boolean insideTransaction(Handle handle) throws WCDBException {
                for (String kind : new String[] {"s", "m", "f"}) {
                    handle.deleteObjects(TABLE, DBWcdbRecord.id.like(kind + ":%"));
                }
                handle.execute("UPDATE kv SET id = 's:' || substr(id, 4) WHERE id > 'ss:' AND id < 'ss;'");
                handle.execute("UPDATE kv SET id = 'm:' || substr(id, 4) WHERE id > 'ms:' AND id < 'ms;'");
                handle.execute("UPDATE kv SET id = 'f:' || substr(id, 4) WHERE id > 'fs:' AND id < 'fs;'");
                return true;
            }
        });
    }

    public void clear(String kind) throws WCDBException {
        table.deleteObjects(DBWcdbRecord.id.like(kind + ":%"));
    }

    /** 把查询结果转成 JS 需要的 id 列表（读摘要时只需要 id）。 */
    public List<String> ids(String kind) throws WCDBException {
        List<String> result = new ArrayList<>();
        for (WcdbRecord row : getAll(kind)) {
            result.add(row.id.substring(kind.length() + 1));
        }
        result.sort(String::compareTo);
        return result;
    }

    public void close() {
        db.close();
    }
}

