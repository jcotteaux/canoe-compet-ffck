<?php
class AuditLogger {
    private $pdo;
    private $enabled;
    private $level;
    private $tableName = 'KCross_Audit_Log';
    private $startTime;
    private $currentAudit;
    public function __construct($pdo, $config) {
        $this->pdo = $pdo;
        $this->enabled = $config['audit']['enabled'] ?? false;
        $this->level = $config['audit']['level'] ?? 'standard';
    }
    public function isEnabled() {
        return $this->enabled;
    }
    public function startAction($competitionCode, $action, $modifiedBy, $payload) {
        if (!$this->enabled) return;
        $this->startTime = microtime(true);
        $this->currentAudit = [
            'timestamp' => round($this->startTime * 1000),
            'Code_competition' => $competitionCode,
            'action' => $action,
            'modified_by' => $modifiedBy,
            'ip_address' => $this->getClientIp(),
            'user_agent' => $this->truncate($_SERVER['HTTP_USER_AGENT'] ?? '', 255),
            'payload_summary' => $this->summarizePayload($payload),
            'tables_affected' => null,
            'records_affected' => 0,
            'old_values' => null,
            'new_values' => null
        ];
    }
    public function recordTableChange($tableName, $recordCount, $oldValues = null, $newValues = null) {
        if (!$this->enabled || !$this->currentAudit) return;
        $tables = $this->currentAudit['tables_affected'] ?? '';
        if ($tables === '' || strpos($tables, $tableName) === false) {
            $this->currentAudit['tables_affected'] = $tables ? "$tables,$tableName" : $tableName;
        }
        $this->currentAudit['records_affected'] =
            ($this->currentAudit['records_affected'] ?? 0) + $recordCount;
        if ($this->level === 'detailed') {
            if ($oldValues !== null) {
                $existing = json_decode($this->currentAudit['old_values'] ?? '[]', true) ?: [];
                $existing[] = ['table' => $tableName, 'data' => $oldValues];
                $this->currentAudit['old_values'] = json_encode($existing, JSON_UNESCAPED_UNICODE);
            }
            if ($newValues !== null) {
                $existing = json_decode($this->currentAudit['new_values'] ?? '[]', true) ?: [];
                $existing[] = ['table' => $tableName, 'data' => $newValues];
                $this->currentAudit['new_values'] = json_encode($existing, JSON_UNESCAPED_UNICODE);
            }
        }
    }
    public function endAction($success = true, $errorMessage = null) {
        if (!$this->enabled || !$this->currentAudit) return;
        $this->currentAudit['duration_ms'] = round((microtime(true) - $this->startTime) * 1000);
        $this->currentAudit['success'] = $success ? 1 : 0;
        $this->currentAudit['error_message'] = $errorMessage ? $this->truncate($errorMessage, 65535) : null;
        $this->saveAuditLog();
        $this->currentAudit = null;
    }
    private function saveAuditLog() {
        $data = $this->currentAudit;
        if ($this->level === 'minimal') {
            unset($data['tables_affected']);
            unset($data['records_affected']);
            unset($data['payload_summary']);
            unset($data['old_values']);
            unset($data['new_values']);
        }
        $data = array_filter($data, function($v) {
            return $v !== null;
        });
        $columns = array_keys($data);
        $placeholders = array_fill(0, count($columns), '?');
        $sql = "INSERT INTO {$this->tableName} (" . implode(',', $columns) . ")
                VALUES (" . implode(',', $placeholders) . ")";
        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute(array_values($data));
        } catch (Exception $e) {
            error_log("[Audit] Erreur sauvegarde: " . $e->getMessage());
        }
    }
    private function summarizePayload($payload) {
        if ($this->level === 'minimal' || !is_array($payload)) {
            return null;
        }
        $keysToExclude = ['action', 'competitionCode', 'modifiedBy', 'expectedLastModified'];
        $summary = [];
        foreach ($payload as $key => $value) {
            if (in_array($key, $keysToExclude)) {
                continue;
            }
            if (is_array($value)) {
                $summary[$key] = $this->summarizeValue($value);
            } elseif (is_object($value)) {
                $summary[$key] = $this->summarizeValue((array)$value);
            } else {
                $summary[$key] = $value;
            }
        }
        if (empty($summary)) {
            return null;
        }
        return json_encode($summary, JSON_UNESCAPED_UNICODE);
    }
    private function summarizeValue($value, $depth = 0, $maxDepth = 4, $maxItems = 30) {
        if ($depth > $maxDepth) {
            if (is_array($value)) {
                return '[depth limit, ' . count($value) . ' items]';
            }
            return $value;
        }
        if (!is_array($value)) {
            return $value;
        }
        $count = count($value);
        $result = [];
        $i = 0;
        foreach ($value as $key => $item) {
            if ($i >= $maxItems) {
                $result['...'] = ($count - $maxItems) . ' autres éléments';
                break;
            }
            if (is_array($item) || is_object($item)) {
                $result[$key] = $this->summarizeValue((array)$item, $depth + 1, $maxDepth, $maxItems);
            } else {
                $result[$key] = $item;
            }
            $i++;
        }
        return $result;
    }
    private function getClientIp() {
        $headers = [
            'HTTP_CLIENT_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_FORWARDED',
            'HTTP_X_CLUSTER_CLIENT_IP',
            'HTTP_FORWARDED_FOR',
            'HTTP_FORWARDED',
            'REMOTE_ADDR'
        ];
        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = $_SERVER[$header];
                if (strpos($ip, ',') !== false) {
                    $ip = trim(explode(',', $ip)[0]);
                }
                return $this->truncate($ip, 45);
            }
        }
        return null;
    }
    private function truncate($str, $maxLength) {
        if (strlen($str) > $maxLength) {
            return substr($str, 0, $maxLength - 3) . '...';
        }
        return $str;
    }
}
$auditLogger = null;
