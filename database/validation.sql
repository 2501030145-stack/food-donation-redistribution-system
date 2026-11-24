USE food_donation;

-- 1. Confirm the eight core entities and the separate application account table.
SHOW TABLES;

-- 2. Donation lifecycle summary (quantities retain their original units).
SELECT Status, COUNT(*) AS donation_count, SUM(Quantity) AS recorded_quantity
FROM Food_Donation GROUP BY Status ORDER BY Status;

-- 3. Aggregate: donations and recorded quantity by category.
SELECT fc.Category_Name, COUNT(fd.Donation_ID) AS donation_count,
       COALESCE(SUM(fd.Quantity),0) AS recorded_quantity
FROM Food_Category fc LEFT JOIN Food_Donation fd ON fd.Category_ID=fc.Category_ID
GROUP BY fc.Category_ID,fc.Category_Name ORDER BY recorded_quantity DESC;

-- 4. Join: trace a donation from donor through volunteer to recipients.
SELECT * FROM vw_donation_trace ORDER BY Donation_ID,Distribution_ID;

-- 5. Nested query: donors with more donations than the average donor.
SELECT d.Name,COUNT(fd.Donation_ID) AS donation_count
FROM Donor d JOIN Food_Donation fd ON fd.Donor_ID=d.Donor_ID
GROUP BY d.Donor_ID,d.Name
HAVING COUNT(fd.Donation_ID) > (SELECT AVG(donor_count) FROM
 (SELECT COUNT(*) AS donor_count FROM Food_Donation GROUP BY Donor_ID) AS donor_totals);

-- 6. Negative test A (unverified recipient): should fail with SQLSTATE 45000.
-- INSERT INTO Distribution(Pickup_ID,Recipient_ID,Quantity_Distributed,Distribution_Date)
-- VALUES (1,3,1,CURRENT_DATE());

-- 7. Negative test B (over-distribution): choose a collected pickup and attempt a total
-- greater than its original donation quantity; should fail with SQLSTATE 45000.
-- INSERT INTO Distribution(Pickup_ID,Recipient_ID,Quantity_Distributed,Distribution_Date)
-- VALUES (1,1,999999,CURRENT_DATE());

-- 8. Housekeeping: call only when you want overdue Available/Collected rows expired.
-- CALL sp_mark_expired();
